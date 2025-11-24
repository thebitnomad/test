import { showConsoleLibraryError } from './general.util.js';
import botTexts from '../helpers/bot.texts.helper.js';
export async function questionAI(text) {
    try {
        //
    }
    catch (err) {
        showConsoleLibraryError(err, 'questionAI');
        throw new Error(botTexts.library_error);
    }
}
export async function imageAI(text) {
    try {
        //
    }
    catch (err) {
        showConsoleLibraryError(err, 'imageAI');
        throw new Error(botTexts.library_error);
    }
}
