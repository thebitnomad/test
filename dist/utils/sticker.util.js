import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs-extra';
import crypto from 'node:crypto';
import webp from "node-webpmux";
import { getTempPath, showConsoleLibraryError } from './general.util.js';
import { fileTypeFromBuffer } from 'file-type';
import botTexts from '../helpers/bot.texts.helper.js';
export async function createSticker(mediaBuffer, { pack = 'Educabit', author = 'Educabit Stickers', fps = 9, type = 'resize' }) {
    try {
        const bufferSticker = await stickerCreation(mediaBuffer, { pack, author, fps, type });
        return bufferSticker;
    }
    catch (err) {
        showConsoleLibraryError(err, 'createSticker');
        throw new Error(botTexts.library_error);
    }
}
export async function renameSticker(stickerBuffer, pack, author) {
    try {
        const stickerBufferModified = await addExif(stickerBuffer, pack, author);
        return stickerBufferModified;
    }
    catch (err) {
        showConsoleLibraryError(err, 'renameSticker');
        throw new Error(botTexts.library_error);
    }
}
export async function stickerToImage(stickerBuffer) {
    try {
        const inputWebpPath = getTempPath('webp');
        const outputPngPath = getTempPath('png');
        fs.writeFileSync(inputWebpPath, stickerBuffer);
        await new Promise((resolve, reject) => {
            ffmpeg(inputWebpPath)
                .save(outputPngPath)
                .on('end', () => resolve())
                .on('error', (err) => reject(err));
        });
        const imageBuffer = fs.readFileSync(outputPngPath);
        fs.unlinkSync(inputWebpPath);
        fs.unlinkSync(outputPngPath);
        return imageBuffer;
    }
    catch (err) {
        showConsoleLibraryError(err, 'stickerToImage');
        throw new Error(botTexts.library_error);
    }
}
async function stickerCreation(mediaBuffer, { author, pack, fps, type }) {
    try {
        const bufferData = await fileTypeFromBuffer(mediaBuffer);
        if (!bufferData) {
            throw new Error("Unable to retrieve data from sent media.");
        }
        const mime = bufferData.mime;
        const isAnimated = mime.startsWith('video') || mime.includes('gif');
        if (mime == 'image/webp')
            mediaBuffer = await pngConvertion(mediaBuffer);
        const webpBuffer = await webpConvertion(mediaBuffer, isAnimated, fps, type);
        const stickerBuffer = await addExif(webpBuffer, pack, author);
        return stickerBuffer;
    }
    catch (err) {
        throw err;
    }
}
async function addExif(buffer, pack, author) {
    try {
        const img = new webp.Image();
        const stickerPackId = crypto.randomBytes(32).toString('hex');
        const json = { 'sticker-pack-id': stickerPackId, 'sticker-pack-name': pack, 'sticker-pack-publisher': author };
        const exifAttr = Buffer.from([0x49, 0x49, 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00]);
        const jsonBuffer = Buffer.from(JSON.stringify(json), 'utf8');
        const exif = Buffer.concat([exifAttr, jsonBuffer]);
        exif.writeUIntLE(jsonBuffer.length, 14, 4);
        await img.load(buffer);
        img.exif = exif;
        const stickerBuffer = await img.save(null);
        return stickerBuffer;
    }
    catch (err) {
        throw err;
    }
}
async function pngConvertion(mediaBuffer) {
    try {
        const inputMediaPath = getTempPath('webp');
        const outputMediaPath = getTempPath('png');
        fs.writeFileSync(inputMediaPath, mediaBuffer);
        await new Promise((resolve, reject) => {
            ffmpeg(inputMediaPath)
                .save(outputMediaPath)
                .on('end', () => resolve())
                .on('error', (err) => reject(err));
        }).catch((err) => {
            fs.unlinkSync(inputMediaPath);
            throw err;
        });
        const pngBuffer = fs.readFileSync(outputMediaPath);
        fs.unlinkSync(outputMediaPath);
        fs.unlinkSync(inputMediaPath);
        return pngBuffer;
    }
    catch (err) {
        throw err;
    }
}
async function webpConvertion(mediaBuffer, isAnimated, fps, type) {
    try {
        let inputMediaPath;
        let options;
        let outputMediaPath = getTempPath('webp');
        if (isAnimated) {
            inputMediaPath = getTempPath('mp4');
            options = [
                "-vcodec libwebp",
                "-filter:v",
                `fps=fps=${fps}`,
                "-lossless 0",
                "-compression_level 4",
                "-q:v 10",
                "-loop 1",
                "-preset picture",
                "-an",
                "-vsync 0",
                "-s 512:512"
            ];
        }
        else {
            inputMediaPath = getTempPath('png');
            mediaBuffer = await editImage(mediaBuffer, type);
            options = [
                "-vcodec libwebp",
                "-loop 0",
                "-lossless 1",
                "-q:v 100"
            ];
        }
        fs.writeFileSync(inputMediaPath, mediaBuffer);
        await new Promise((resolve, reject) => {
            ffmpeg(inputMediaPath)
                .outputOptions(options)
                .save(outputMediaPath)
                .on('end', () => resolve())
                .on('error', (err) => reject(err));
        }).catch((err) => {
            fs.unlinkSync(inputMediaPath);
            throw err;
        });
        const webpBuffer = fs.readFileSync(outputMediaPath);
        fs.unlinkSync(outputMediaPath);
        fs.unlinkSync(inputMediaPath);
        return webpBuffer;
    }
    catch (err) {
        throw err;
    }
}
async function editImage(imageBuffer, type) {
    try {
        const image = await jimp.read(imageBuffer);
        if (type === 'resize') {
            image['resize'](512, 512);
        }
        else if (type === 'contain') {
            image['contain'](512, 512);
        }
        else if (type === 'circle') {
            image['resize'](512, 512);
            image.circle();
        }
        return image.getBufferAsync('image/png');
    }
    catch (err) {
        throw err;
    }
}
