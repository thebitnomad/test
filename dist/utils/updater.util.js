import axios from 'axios';
import AdmZip from 'adm-zip';
import { showConsoleLibraryError } from './general.util.js';
export async function checkUpdate(currentBotVersion) {
    try {
        const [currentMajor, currentMinor, currentPatch] = currentBotVersion.split(".");
        const remoteVersion = data.tag_name;
        const [remoteMajor, remoteMinor, remotePatch] = remoteVersion.split(".");
        let response = {
            latest: true,
        };
        if (Number(currentMajor) == Number(remoteMajor) && Number(currentMinor) == Number(remoteMinor) && Number(currentPatch) < Number(remotePatch)) {
            response.latest = false;
        }
        if (Number(currentMajor) < Number(remoteMajor) || (Number(currentMajor) == Number(remoteMajor) && Number(currentMinor) < Number(remoteMinor))) {
            response.latest = false;
        }
        return response;
    }
    catch (err) {
        showConsoleLibraryError(err, 'checkUpdate');
        throw err;
    }
}
export async function makeUpdate(path = './') {
    try {
        const assetUrl = data.assets[0].browser_download_url;
        const { data: remoteVersion } = await axios.get(assetUrl, { responseType: 'arraybuffer' });
        const zipBuffer = Buffer.from(remoteVersion, 'utf-8');
        const zip = new AdmZip(zipBuffer);
        zip.extractAllToAsync(path, true, true);
    }
    catch (err) {
        throw err;
    }
}
