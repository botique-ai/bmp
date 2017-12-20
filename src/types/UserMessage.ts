import { BotiqueMessage } from "./BotiqueMessage";

export enum ContentType {
  Text,
  Payload,
  Notification,
  Attachment,
  Link
}

export const NON_CONVERSATION_MESSAGE_CONTENT_TYPES = [
  ContentType.Notification
];

export interface UserMessage extends BotiqueMessage {
  dateReceived: Date;
  isEcho: boolean;
  userId: string;
  metadata?: any;
  contentType: ContentType;
  isAdminMessage?: boolean;
  content: UserMessageContent;
}

export interface UserMessageContent {
  text?: string;
  link?: string;
  payload?: string;
  attachments?: Array<UserMessageAttachment>;
}

export type UserMessageAttachmentType =
  | "audio"
  | "fallback"
  | "file"
  | "image"
  | "location"
  | "video";

export interface UserMessageAttachment {
  type?: UserMessageAttachmentType;
  payload?: {
    url?: string;
    coordinates?: {
      // Coordinates will be send for att type 'location'
      lat: number;
      long: number;
    };
  };
}
