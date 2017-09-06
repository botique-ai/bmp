import { ObjectID } from "mongodb";
import { isEmpty, get, reduce, castArray, map } from "lodash";
import { v4 as uuid } from "uuid";
import * as urlUtil from "url";
import {
  ButtonType,
  BotMessage,
  BotMessaageAttachment,
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
  Typing
} from "botframework-directlinejs";
import { UserConversation } from "../types/UserConversation";
import {
  UserMessage,
  ContentType,
  UserMessageAttachment
} from "../types/UserMessage";
import { BotPlatformType } from "../types/BotPlatformType";
import { parseJSONwithStringFallback } from "../utils";
import { ChatUserProfile } from "../types/ChatUserProfile";

export const BUTTON_TYPE_MAPPINGS: { [key in ButtonType]: CardActionTypes } = {
  web_url: "openUrl",
  phone_number: "call",
  postback: "postBack"
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
    const activityJSON = JSON.parse(directlineActivity.text);
    if (!isEmpty(activityJSON.payload)) {
      // If we have a valid json with a payload attribute, we assume a pyload message was sent
      return mapPayloadDirectLineMessageToUserMessage(
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
            resultMessage.text = `User sent attachment of type ${v.type}`;
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
  if (get(botMessage, "message.message.sender_action") === "typing_on") {
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
      type: "message",
      text:
        botMessage.message.message && !isEmpty(botMessage.message.message.text)
          ? botMessage.message.message.text
          : "",
      channelData: {
        clientActivityId: botMessage.originId
      },
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
      resultMessage.attachments.push(
        mapQuickReplies(botMessage.message.message.quick_replies)
      );
    }
  }
  if (resultMessage) {
    return { ...resultMessage, ...overrides };
  }
}

export function mapAttachment(
  attachment: UserMessageAttachment | BotMessaageAttachment
): Attachment | Attachment[] {
  switch (attachment.type) {
    case "image":
    case "audio":
    case "video":
      return mapMedia(attachment);
    case "template":
      return mapTemlpate(attachment);
  }
}

export function mapMedia(
  attachment: UserMessageAttachment | BotMessaageAttachment
): Media {
  return {
    contentType: `${attachment.type}/${urlUtil
      .parse(attachment.payload.url)
      .pathname.split(".")
      .pop()}` as any,
    contentUrl: attachment.payload.url
  };
}

export function mapQuickReplies(quickReplies: Array<QuickReply>): HeroCard {
  return {
    contentType: "application/vnd.microsoft.card.hero",
    content: {
      buttons: quickReplies.map<CardAction>((reply: QuickReply) => ({
        type: "postBack",
        value: JSON.stringify({ payload: reply.payload }),
        title: reply.title
      }))
    }
  };
}

export function mapTemlpate(
  attachment: BotMessaageAttachment
): HeroCard | Array<HeroCard> {
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
              images: [
                {
                  url: el.image_url
                }
              ],
              buttons: map(el.buttons, (button: any) => mapButton(button))
            }
          } as HeroCard)
      );
    } else if (attachment.payload.template_type === "button") {
      const buttons = attachment.payload.buttons;
      return {
        contentType: "application/vnd.microsoft.card.hero",
        content: {
          text: attachment.payload.text,
          buttons: map(buttons, (button: any) => mapButton(button))
        }
      };
    }
  }
}

export function mapButton(button: Button): CardAction {
  const cardActionType = BUTTON_TYPE_MAPPINGS[button.type];
  let value = button.title;
  if (!cardActionType) {
    return;
  }

  if (cardActionType === "openUrl") {
    const url = button.url["urlString"] || button.url;
    const params = button.url["parameters"];
    value = params
      ? `${url}?${map(params, (v, k) => `${k}=${v}&`)}`.slice(0, -1)
      : url;
  } else if (cardActionType === "postBack") {
    value = JSON.stringify({ payload: button.payload });
  }

  return {
    type: BUTTON_TYPE_MAPPINGS[button.type],
    title: button.title,
    value
  };
}
