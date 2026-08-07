import { CHARACTERS } from './Constants';

/**
 * Preloads character sprite sheets in the background without blocking the game.
 * Images are cached by browser automatically once loaded.
 */
export class SpritePreloader {
  static preload() {
    // Non-blocking: just load all unlocked character sprites in the background
    const spriteUrls = new Set();
    
    CHARACTERS.forEach(char => {
      if (char.walkSprite) spriteUrls.add(char.walkSprite);
      if (char.image) spriteUrls.add(char.image);
    });

    // Fire-and-forget image loading
    spriteUrls.forEach(url => {
      const img = new Image();
      img.src = url;
      // Just let it load silently in background
    });
  }
}