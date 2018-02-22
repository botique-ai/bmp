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
  UnknownMedia,
  Location,
  EventActivity
} from "@botique/botframework-directlinejs";
import { UserConversation } from "../types/UserConversation";
import {
  UserMessage,
  ContentType,
  UserMessageAttachment
} from "../types/UserMessage";
import { parseJSONwithStringFallback } from "../utils";
import { ChatUserProfile } from "../types/ChatUserProfile";
import { UserMessageAttachmentType } from "../index";
import { DIRECT_LINE_SUPPORTED_EVENT_NAMES } from "../types/DirectLineExtensions";

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

export function mapAnyDirectLinActivityToUserMessage(
  directlineActivity: IActivity,
  userId: string,
  botId: string | ObjectID,
  platformData: {}
): UserMessage {
  switch (directlineActivity.type) {
    case "message":
      return mapDirectLineMessageToUserMessage(
        directlineActivity as Message,
        userId,
        botId,
        platformData
      );
    case "event":
      return mapDirectLineEventActivityToUserMessage(
        directlineActivity as EventActivity,
        userId,
        botId,
        platformData
      );
    default:
      throw new Error(
        `Could not map directline activity of type ${directlineActivity.type}`
      );
  }
}

function mapDirectLineMessageToUserMessage(
  directlineActivity: Message,
  userId: string,
  botId: string | ObjectID,
  platformData: {}
): UserMessage {
  // Directline doesnt specify clearly when a button was clicked.. we should check for ourselves
  try {
    const activityJSON =
      directlineActivity.value || JSON.parse(directlineActivity.text || "{}");
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
        mapDirectLineAttachmentToBotiqueAttachment(
          directlineActivity.attachments[0]
        )
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
    content: {
      payload: directlineActivity.value
        ? JSON.stringify({
            ...JSON.parse((directlineActivity.value as any).payload),
            title: (directlineActivity.value as any).title
          })
        : JSON.parse(directlineActivity.text).payload
    }
  };
}

export function mapDirectLineEventActivityToUserMessage(
  directlineEventActivity: EventActivity,
  userId: string,
  botId: string | ObjectID,
  platformData: {}
): UserMessage {
  switch (directlineEventActivity.name) {
    case DIRECT_LINE_SUPPORTED_EVENT_NAMES.referral:
      return {
        originId: get(
          directlineEventActivity,
          "channelData.clientActivityId",
          uuid()
        ),
        bot: {
          _id: botId,
          platformData
        },
        isEcho: false,
        dateReceived: new Date(directlineEventActivity.timestamp),
        userId,
        contentType: ContentType.Notification,
        content: {
          payload: Buffer.from(
            directlineEventActivity.value,
            "base64"
          ).toString()
        }
      };
    default:
      throw new Error(
        `Could not translate activity event with name "${
          directlineEventActivity.name
        }", see DIRECT_LINE_SUPPORTED_EVENT_NAMES for supported names`
      );
  }
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
      resultMessage.text = `Cannot display content of type ${
        ContentType[userMessage.contentType]
      }`;
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
    case "location":
      return mapLocation(attachment);
    default:
      return mapFile(attachment);
  }
}

export function mapLocation(attachment: UserMessageAttachment): Location {
  return {
    contentType: "location",
    content: {
      latitude: attachment.payload.coordinates.lat,
      longitude: attachment.payload.coordinates.long
    }
  };
}

export function mapFile(
  attachment: UserMessageAttachment | BotMessageAttachment
): UnknownMedia {
  return {
    contentType: "file",
    contentUrl: attachment.payload.url,
    name: decodeURIComponent(
      urlUtil
        .parse(attachment.payload.url)
        .pathname.split("/")
        .pop()
    )
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
    name: decodeURIComponent(
      urlUtil
        .parse(attachment.payload.url)
        .pathname.split("/")
        .pop()
    )
  };
}

export function mapQuickReplies(
  quickReplies: Array<QuickReply>
): Array<CardAction> {
  return map<QuickReply, CardAction>(
    quickReplies,
    (quickReply: QuickReply) =>
      quickReply.content_type === "location"
        ? mapLocationQuickReply(quickReply)
        : mapTextQuickReply(quickReply)
  );
}

export function mapTextQuickReply(quickReply: QuickReply): CardAction {
  return {
    type: "postBack",
    value: JSON.stringify({ payload: quickReply.payload }),
    title: quickReply.title
  };
}

export function mapLocationQuickReply(quickReply: QuickReply): CardAction {
  return {
    type: "location"
  };
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
  let value: any = button.title;
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
    value = { payload: button.payload, title: button.title };
    return {
      type: cardActionType,
      title: button.title,
      data: value
    };
  }
}

function mapDirectLineAttachmentToBotiqueAttachment(
  directLineAttachment: Attachment
): UserMessageAttachment {
  switch (directLineAttachment.contentType) {
    case "location":
      return {
        type: "location",
        payload: mapDirectLineAttachmentLocationPayloadToBotiqueAttachmentPayload(
          directLineAttachment as Location
        )
      };
    default:
      return {
        type: mapDirectLineAttachmentTypeToBotiqueAttachmentType(
          directLineAttachment.contentType
        ),
        payload: {
          url: directLineAttachment["contentUrl"]
        }
      };
  }
}

function mapDirectLineAttachmentLocationPayloadToBotiqueAttachmentPayload(
  directLineLocationAttachment: Location
) {
  return {
    coordinates: {
      long: directLineLocationAttachment.content.longitude,
      lat: directLineLocationAttachment.content.latitude
    }
  };
}

function mapDirectLineAttachmentTypeToBotiqueAttachmentType(
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
