import { ObjectID } from "mongodb";
import { pickBy } from "lodash";
import { v4 } from "uuid";
import { BotPlatformData } from "./BotPlatformData";
import { TargetIntent } from "./TargetIntent";
import { TargetParameter } from "./TargetParameter";
import { BotiqueMessage } from "./BotiqueMessage";

export interface QuickReply {
  content_type: string;
  title: string;
  payload: string;
  image_url?: string;
}

export declare type ButtonType =
  | "web_url"
  | "postback"
  | "phone_number"
  | "element_share"
  | string;
export interface Button {
  type: ButtonType;
  title?: string;
  url?: string | { urlString: string; parameters: any };
  payload?: string | ObjectID | TargetIntent | TargetParameter;
}

export function createButton(
  title: string,
  type: "web_url" | "postback" | "phone_number" | string,
  url?: string | { urlString: string; parameters: any },
  payload?: string | ObjectID | TargetIntent | TargetParameter
): Button {
  return pickBy({
    type,
    title,
    url,
    payload
  }) as Button;
}

export function createPostbackButton(
  title: string,
  payload?: string | ObjectID | TargetIntent | TargetParameter
) {
  return createButton(title, "postback", null, payload);
}

export function createUrlButton(
  title: string,
  url: string | { urlString: string; parameters: any }
) {
  return createButton(title, "web_url", url);
}

export interface GenericElement {
  title: string;
  item_url?: string | { urlString: string; parameters: any };
  image_url?: string;
  subtitle?: string;
  buttons?: Array<Button>;
}

export function createGenericElement(
  title: string,
  buttons?: Array<Button>,
  image_url?: string,
  subtitle?: string,
  item_url?: string | { urlString: string; parameters: any }
): GenericElement {
  return pickBy({
    title,
    item_url,
    image_url,
    subtitle,
    buttons
  }) as GenericElement;
}

export interface BotMessageAttachment {
  type: "image" | "audio" | "video" | "file" | "template";
  payload: Payload;
}

export interface Payload {
  template_type?: string;
  type?: "image";
  text?: string;
  buttons?: Array<Button>;
  elements?: Array<any>;
  url?: string;
  top_element_style?: string;
  image_aspect_ratio?: "square" | "horizontal";
}

export interface BotMessage extends BotiqueMessage {
  message: {
    recipient: {
      id?: string;
      phone_number?: string;
    };
    message?: {
      text?: string;
      attachment?: BotMessageAttachment;
      quick_replies?: Array<QuickReply>;
      metadata?: string;
    };
    sender_action?: "typing_on" | "typing_off" | "mark_seen";
    notification_type?: "REGULAR" | "SILENT_PUSH" | "NO_PUSH";
  };
}

export function createBotTextMessage(
  bot: BotPlatformData,
  recipient: string,
  text: string
): BotMessage {
  return {
    bot,
    originId: v4(),
    message: {
      recipient: {
        id: recipient
      },
      message: {
        text
      }
    }
  };
}

export function createBotElementsMessage(
  bot: BotPlatformData,
  recipient: string,
  elements: Array<GenericElement>
): BotMessage {
  return {
    bot,
    originId: v4(),
    message: {
      recipient: {
        id: recipient
      },
      message: {
        attachment: {
          type: "template",
          payload: {
            template_type: "generic",
            elements
          }
        }
      }
    }
  };
}

export function createBotQuickRepliesMessage(
  bot: BotPlatformData,
  recipient: string,
  text: string,
  quickReplies: Array<QuickReply>
): BotMessage {
  return {
    bot,
    originId: v4(),
    message: {
      recipient: {
        id: recipient
      },
      message: {
        text,
        quick_replies: quickReplies.map(qr => ({
          content_type: "text",
          title: qr.title,
          payload: qr.payload,
          image_url: qr.image_url
        }))
      }
    }
  };
}
