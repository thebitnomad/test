import { showConsoleError } from '../utils/general.util.js';
import { GroupController } from '../controllers/group.controller.js';
export async function partialGroupUpdate(groupData) {
    try {
        await new GroupController().updatePartialGroup(groupData);
    }
    catch (err) {
        showConsoleError(err, "PARTIAL-GROUP-UPDATE");
    }
}
