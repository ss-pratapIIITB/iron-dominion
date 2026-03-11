// ─────────────────────────────────────────────
//  PreloadScene – generates all textures
// ─────────────────────────────────────────────
import { generateAllTextures } from '../TextureGen.js';

export default class PreloadScene extends Phaser.Scene {
    constructor() { super({ key: 'PreloadScene' }); }

    create() {
        // Generate all textures procedurally (no external assets needed)
        generateAllTextures(this);

        // Notify index.html to remove loading screen
        window.dispatchEvent(new Event('gameReady'));

        this.scene.start('MenuScene');
    }
}
