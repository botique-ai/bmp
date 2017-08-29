export enum BotPlatformType {
  Facebook,
  BMP
}

export namespace BotPlatformType {
  export function label(e: BotPlatformType): string {
    switch (e) {
      case BotPlatformType.Facebook:
        return "Facebook";
      case BotPlatformType.BMP:
        return "BMP";
    }
  }
}
