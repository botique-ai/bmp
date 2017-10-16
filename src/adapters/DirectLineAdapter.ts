import { ObjectID } from "mongodb";
import { isEmpty, get, reduce, castArray, map, compact } from "lodash";
import { v4 as uuid } from "uuid";
import * as urlUtil from "url";
import {
  ButtonType,
  BotMessage,
  BotMessageAttachment,
  QuickReply,
  Button
} from "../types/BotMessage";
import {
  CardActionTypes,
  Message,
  Attachment,
  Media,
  HeroCard,
  CardAction,
  IActivity,
  Typing,
  AdaptiveCard,
  MediaType,
  UnknownMedia
} from "botframework-directlinejs";
import { UserConversation } from "../types/UserConversation";
import {
  UserMessage,
  ContentType,
  UserMessageContent,
  UserMessageAttachment
} from "../types/UserMessage";
import { BotPlatformType } from "../types/BotPlatformType";
import { parseJSONwithStringFallback } from "../utils";
import { ChatUserProfile } from "../types/ChatUserProfile";
import { UserMessageAttachmentType } from "../index";

export const BUTTON_TYPE_MAPPINGS: { [key in ButtonType]: CardActionTypes } = {
  web_url: "openUrl",
  phone_number: "call",
  postback: "postBack"
};

export const ADAPTIVE_CARD_ACTION_TYPE_MAPPINGS = {
  web_url: "Action.OpenUrl",
  phone_number: "call",
  postback: "Action.Submit"
};

export function mapUserConversationToDirectLineMessage(
  conversation: UserConversation,
  userId: string,
  userProfile: ChatUserProfile
) {
  let result: IActivity;
  if (conversation.fromBot === true) {
    result = mapBotMessageToDirectLineMessage(
      conversation.message as BotMessage
    );
  } else {
    result = mapUserMessageToDirectLineMessage(
      conversation.message as UserMessage,
      userId,
      userProfile
    );
  }

  if (result) {
    if (!result.channelData.clientActivityId) {
      result.channelData.clientActivityId = conversation._id;
      result.id = conversation._id.toHexString();
    }
    result.timestamp = conversation.timestamp as any;
    return result;
  }
}

export function mapAnyDirectLineMessageToUserMessage(
  directlineActivity: Message,
  userId: string,
  botId: string | ObjectID,
  platformData: {}
): UserMessage {
  // Directline doesnt specify clearly when a button was clicked.. we should check for ourselves
  try {
    const activityJSON = JSON.parse(directlineActivity.text || "{}");
    if (!isEmpty(activityJSON.payload)) {
      // If we have a valid json with a payload attribute, we assume a payload message was sent
      return mapPayloadDirectLineMessageToUserMessage(
        directlineActivity,
        userId,
        botId,
        platformData
      );
    } else if (!isEmpty(directlineActivity.attachments)) {
      return mapAttachmentDirectLineMessageToUserMessage(
        directlineActivity,
        userId,
        botId,
        platformData
      );
    } else {
      return mapTextDirectLineMessageToUserMessage(
        directlineActivity,
        userId,
        botId,
        platformData
      );
    }
  } catch (err) {
    if (!(err instanceof SyntaxError)) {
      throw err;
    }
    return mapTextDirectLineMessageToUserMessage(
      directlineActivity,
      userId,
      botId,
      platformData
    );
  }
}

export function mapAttachmentDirectLineMessageToUserMessage(
  directlineActivity: Message,
  userId: string,
  botId: string,
  platformData: {}
): UserMessage {
  if (directlineActivity.attachments.length > 1) {
    console.warn(
      `Directline attachment to UserMessage only supports one attachment\n using only the first one`
    );
  }
  return {
    originId: get(directlineActivity, "channelData.clientActivityId", uuid()),
    bot: { _id: botId, platformData },
    isEcho: false,
    dateReceived: new Date(directlineActivity.timestamp),
    userId,
    contentType: ContentType.Attachment,
    content: {
      attachments: [
        {
          type: mapDirectLineAttachmentTypeToBotique(
            directlineActivity.attachments[0]["contentType"]
          ),
          payload: {
            url: directlineActivity.attachments[0]["contentUrl"]
          }
        }
      ]
    }
  };
}

export function mapTextDirectLineMessageToUserMessage(
  directlineActivity: Message,
  userId: string,
  botId: string,
  platformData: {}
): UserMessage {
  return {
    originId: get(directlineActivity, "channelData.clientActivityId", uuid()),
    bot: {
      _id: botId,
      platformData
    },
    isEcho: false,
    dateReceived: new Date(directlineActivity.timestamp),
    userId,
    contentType: ContentType.Text,
    content: {
      text: directlineActivity.text
    }
  };
}

export function mapPayloadDirectLineMessageToUserMessage(
  directlineActivity: Message,
  userId: string,
  botId: string | ObjectID,
  platformData: {}
): UserMessage {
  return {
    originId: get(directlineActivity, "channelData.clientActivityId", uuid()),
    bot: {
      _id: botId,
      platformData
    },
    isEcho: false,
    dateReceived: new Date(directlineActivity.timestamp),
    userId,
    contentType: ContentType.Payload,
    content: { payload: JSON.parse(directlineActivity.text).payload }
  };
}

export function mapUserMessageToDirectLineMessage(
  userMessage: UserMessage,
  userId: string,
  userProfile: ChatUserProfile,
  overrides?: Partial<Message>
): Message {
  let resultMessage = {
    id: userMessage.originId,
    type: "message",
    textFormat: "plain",
    text: userMessage.content.text || "",
    channelData: {
      clientActivityId: userMessage.originId
    },
    timestamp: userMessage.dateReceived as any,
    from: {
      id: userId,
      name: `${userProfile.firstName} ${userProfile.lastName}`
    }
  } as Message;
  switch (userMessage.contentType) {
    case ContentType.Text:
      break;
    case ContentType.Attachment:
      resultMessage.attachments = reduce(
        userMessage.content.attachments,
        (acc, v: UserMessageAttachment) => {
          const att = mapAttachment(v);
          if (!att) {
            resultMessage.text = `Sent attachment`;
          } else {
            acc.push(att);
          }
          return acc;
        },
        []
      );
      break;
    case ContentType.Payload:
      const title = parseJSONwithStringFallback(userMessage.content.payload)
        .title;
      resultMessage.text = title;
      break;
    case ContentType.Link:
      const link = userMessage.content.link;
      resultMessage.text = link;
      break;
    default:
      resultMessage.text = `Cannot display content of type ${ContentType[
        userMessage.contentType
      ]}`;
  }
  return {
    ...resultMessage,
    ...overrides
  };
}

export function mapBotMessageToDirectLineMessage(
  botMessage: BotMessage,
  overrides?: Partial<Message>
): IActivity {
  let resultMessage;
  if (botMessage.message.sender_action === "typing_on") {
    resultMessage = {
      id: botMessage.originId,
      type: "typing",
      channelData: { clientActivityId: botMessage.originId },
      from: {
        id: botMessage.bot._id.toString(),
        name: `${botMessage.bot.name}`
      },
      attachments: []
    } as Typing;
  } else if (botMessage.message.message) {
    resultMessage = {
      id: botMessage.originId,
      textFormat: "plain",
      type: "message",
      text:
        botMessage.message.message && !isEmpty(botMessage.message.message.text)
          ? botMessage.message.message.text
          : "",
      channelData: { clientActivityId: botMessage.originId },
      from: {
        id: botMessage.bot._id.toString(),
        name: `${botMessage.bot.name}`
      },
      attachments: []
    } as Message;

    // Check if we have any attachments, usually templates
    const attachment = botMessage.message.message.attachment;
    if (!isEmpty(attachment)) {
      const att = mapAttachment(attachment);
      if (!att) {
        resultMessage.text = `<Bot sent attachment of type ${attachment.type}>`;
      } else {
        delete resultMessage.text;
        resultMessage.attachmentLayout = "carousel";
        resultMessage.attachments = castArray(att) as Attachment[];
      }
    }

    // Check if we have any quick replies
    if (!isEmpty(botMessage.message.message.quick_replies)) {
      resultMessage = {
        ...resultMessage,
        suggestedActions: {
          actions: mapQuickReplies(botMessage.message.message.quick_replies)
        }
      } as Message;
    }
  }
  if (resultMessage) {
    return { ...resultMessage, ...overrides };
  }
}

export function mapAttachment(
  attachment: UserMessageAttachment | BotMessageAttachment
): Attachment | Attachment[] {
  switch (attachment.type) {
    case "image":
    case "audio":
    case "video":
      return mapMedia(attachment);
    case "template":
      return mapTemlpate(attachment);
    default:
      return mapFile(attachment);
  }
}

export function mapFile(
  attachment: UserMessageAttachment | BotMessageAttachment
): UnknownMedia {
  return {
    contentType: "file",
    contentUrl: attachment.payload.url,
    name: urlUtil
      .parse(attachment.payload.url)
      .pathname.split("/")
      .pop()
  };
}

export function mapMedia(
  attachment: UserMessageAttachment | BotMessageAttachment
): Media {
  return {
    contentType: `${attachment.type}/${urlUtil
      .parse(attachment.payload.url)
      .pathname.split(".")
      .pop()}` as any,
    contentUrl: attachment.payload.url,
    name: urlUtil
      .parse(attachment.payload.url)
      .pathname.split("/")
      .pop()
  };
}

export function mapQuickReplies(
  quickReplies: Array<QuickReply>
): Array<CardAction> {
  return quickReplies.map<CardAction>((reply: QuickReply) => ({
    type: "postBack",
    value: JSON.stringify({ payload: reply.payload }),
    title: reply.title
  }));
}

export function mapTemlpate(
  attachment: BotMessageAttachment
): HeroCard | Array<HeroCard> | AdaptiveCard | Array<AdaptiveCard> {
  if (attachment.payload) {
    if (attachment.payload.template_type === "generic") {
      const elements = attachment.payload.elements;
      return map(
        elements,
        el =>
          ({
            contentType: "application/vnd.microsoft.card.hero",
            content: {
              title: el.title,
              subtitle: el.subtitle,
              images: [{ url: el.image_url }],
              buttons: map(el.buttons, (button: any) => mapButton(button))
            }
          } as HeroCard)
      );
    } else if (attachment.payload.template_type === "button") {
      const buttons = attachment.payload.buttons;
      return {
        contentType: "application/vnd.microsoft.card.adaptive",
        content: {
          type: "AdaptiveCard",
          body: [
            { type: "TextBlock", text: attachment.payload.text, size: "medium" }
          ],
          actions: compact(map(buttons, mapButtonToAdaptiveCardButton))
        }
      };
    }
  }
}

export function mapButton(button: Button): CardAction {
  if (button.type === "element_share") {
    return { type: "openUrl", title: "Share", value: "#" };
  }

  const cardActionType = BUTTON_TYPE_MAPPINGS[button.type];
  if (!cardActionType) {
    return;
  }

  let value = button.title;
  if (cardActionType === "openUrl") {
    const url = button.url["urlString"] || button.url;
    const params = button.url["parameters"];
    value = params
      ? `${url}?${map(params, (v, k) => `${k}=${v}&`)}`.slice(0, -1)
      : url;
  } else if (cardActionType === "postBack") {
    // we incorporate the button text into the payload so we can
    // save it in history
    const modifiedPayload = {
      ...JSON.parse(button.payload),
      title: button.title
    };

    value = JSON.stringify({ payload: modifiedPayload });
  }

  return {
    type: BUTTON_TYPE_MAPPINGS[button.type],
    title: button.title,
    value
  };
}

export function mapButtonToAdaptiveCardButton(button: Button) {
  if (button.type === "element_share") {
    return {
      type: "Action.OpenUrl",
      title: "Share",
      value: "#"
    };
  }

  const cardActionType = ADAPTIVE_CARD_ACTION_TYPE_MAPPINGS[button.type];
  let value = button.title;
  if (!cardActionType) {
    return;
  }

  if (cardActionType === "Action.OpenUrl") {
    const url = button.url["urlString"] || button.url;
    const params = button.url["parameters"];
    value = params
      ? `${url}?${map(params, (v, k) => `${k}=${v}&`)}`.slice(0, -1)
      : url;
    return {
      type: cardActionType,
      title: button.title,
      url: value
    };
  } else if (cardActionType === "Action.Submit") {
    value = JSON.stringify({ payload: button.payload });
    return {
      type: cardActionType,
      title: button.title,
      data: value
    };
  }
}

function mapDirectLineAttachmentTypeToBotique(
  dlContentType: MediaType | string
): UserMessageAttachmentType {
  switch (true) {
    case /image/.test(dlContentType):
      return "image";
    case /audio/.test(dlContentType):
      return "audio";
    case /video/.test(dlContentType):
      return "video";
    default:
      return "file";
  }
}
