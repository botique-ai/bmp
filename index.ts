export interface BotiqueMessage {
  originId: string;
  bot: BotPlatformData;
}

export enum ContentType {
  Text,
  Payload,
  Notification,
  Attachment,
  Link
}

export interface BotPlatformData {
  _id: string | any;
  name: string;
  platformData: { [key: number]: any }; // the key is a platform type
}

export interface UserMessage extends BotiqueMessage {
  dateReceived: Date;
  isEcho: boolean;
  userId: string;
  metadata?: any;
  contentType: ContentType;
  isAdminMessage?: boolean;
  content: {
    text?: string;
    link?: string;
    payload?: string;
    attachments?: Array<UserMessageAttachment>;
  };
}

export interface UserMessageAttachment {
  type?: "audio" | "fallback" | "file" | "image" | "location" | "video";
  payload?: {
    url?: string;
    coordinates?: {
      // Coordinates will be send for att type 'location'
      lat: Number;
      long: Number;
    };
  };
}
