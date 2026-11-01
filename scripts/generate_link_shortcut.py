"""Build an unsigned link-only template from the existing Apple action schema.

No account credentials are included. Apple signing and on-device validation
remain required; this does not create an iCloud installation link.
"""
from copy import deepcopy
from pathlib import Path
import plistlib

ROOT = Path(__file__).resolve().parents[1]


def build():
    with (ROOT / 'public/shortcuts/save-to-v-unsigned.shortcut').open('rb') as f:
        workflow = plistlib.load(f)
    actions = workflow['WFWorkflowActions']
    # Keep only the text transport and its explicit response-ID confirmation.
    selected = deepcopy([actions[i] for i in [0, 1, 7, 8, 12, 13, 14, 15, 16, 17, 19]])
    selected[0]['WFWorkflowActionParameters']['WFTextActionText'] = 'YOUR_KEY'
    request = selected[3]['WFWorkflowActionParameters']
    request['UUID'] = '108e444d-86b5-4ef0-93b3-f4b7de08de9b'
    request['CustomOutputName'] = 'result'
    fields = request['WFJSONValues']['Value']['WFDictionaryFieldValueItems']
    fields[1]['WFValue']['Value']['string'] = 'ios-share-link'
    old_uuid = actions[10]['WFWorkflowActionParameters']['UUID']

    def rewire(value):
        if isinstance(value, dict):
            for key, item in value.items():
                if key == 'OutputUUID' and item == old_uuid:
                    value[key] = request['UUID']
                else:
                    rewire(item)
        elif isinstance(value, list):
            for item in value:
                rewire(item)

    rewire(selected)
    workflow['WFWorkflowActions'] = selected
    workflow['WFWorkflowName'] = 'Save Link to V'
    workflow['WFWorkflowInputContentItemClasses'] = ['WFStringContentItem', 'WFURLContentItem']
    workflow['WFWorkflowNoInputBehavior']['Parameters']['Error'] = 'Share a link or text to Save Link to V.'
    workflow['WFWorkflowImportQuestions'][0]['ActionIndex'] = 0
    return workflow


if __name__ == '__main__':
    target = ROOT / 'public/shortcuts/save-link-to-v-unsigned.shortcut'
    with target.open('wb') as f:
        plistlib.dump(build(), f, fmt=plistlib.FMT_XML)