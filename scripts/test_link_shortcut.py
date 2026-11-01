import unittest
from generate_link_shortcut import build


class LinkShortcutTests(unittest.TestCase):
    def test_one_request_no_app_launch(self):
        workflow = build()
        actions = workflow['WFWorkflowActions']
        ids = [a['WFWorkflowActionIdentifier'] for a in actions]
        self.assertEqual(ids.count('is.workflow.actions.downloadurl'), 1)
        self.assertNotIn('is.workflow.actions.openurl', ids)
        self.assertNotIn('is.workflow.actions.openapp', ids)
        request = next(a for a in actions if a['WFWorkflowActionIdentifier'].endswith('.downloadurl'))
        self.assertEqual(request['WFWorkflowActionParameters']['WFHTTPMethod'], 'POST')
        self.assertEqual(workflow['WFWorkflowInputContentItemClasses'], ['WFStringContentItem', 'WFURLContentItem'])

    def test_notification_only_after_returned_id(self):
        actions = build()['WFWorkflowActions']
        lookup = actions[5]['WFWorkflowActionParameters']
        self.assertEqual(lookup['WFDictionaryKey'], 'id')
        condition = actions[6]['WFWorkflowActionParameters']
        self.assertEqual(condition['WFCondition'], 100)
        self.assertEqual(condition['WFInput']['Variable']['Value']['OutputUUID'], lookup['UUID'])
        self.assertEqual(actions[7]['WFWorkflowActionIdentifier'], 'is.workflow.actions.notification')
        self.assertEqual(actions[8]['WFWorkflowActionParameters']['WFControlFlowMode'], 1)
        self.assertEqual(actions[9]['WFWorkflowActionIdentifier'], 'is.workflow.actions.showresult')

    def test_response_references_real_request(self):
        actions = build()['WFWorkflowActions']
        request_id = actions[3]['WFWorkflowActionParameters']['UUID']
        self.assertEqual(actions[4]['WFWorkflowActionParameters']['WFInput']['Value']['OutputUUID'], request_id)

    def test_recipient_supplies_own_key(self):
        workflow = build()
        question = workflow['WFWorkflowImportQuestions'][0]
        self.assertEqual(question['ActionIndex'], 0)
        self.assertEqual(question['DefaultValue'], 'YOUR_KEY')
        self.assertEqual(workflow['WFWorkflowActions'][0]['WFWorkflowActionParameters']['WFTextActionText'], 'YOUR_KEY')


if __name__ == '__main__':
    unittest.main()