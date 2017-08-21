import { ObjectID } from 'mongodb';
import { UserMessage } from "./UserMessage";
import { BotMessage } from "./BotMessage";

export interface UserConversation {
  _id: ObjectID;
  botId: ObjectID;
  userId: string;
  timestamp: Date;
  fromBot: boolean;
  message: UserMessage | BotMessage;
}
