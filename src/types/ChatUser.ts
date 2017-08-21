import { ObjectID } from "mongodb";
import { ChatUserProfile } from "./ChatUserProfile";

export interface ChatUser {
  _id?: ObjectID;
  dateCreated: Date;
  userId: string;
  botId: ObjectID;
  profile: ChatUserProfile;
}
