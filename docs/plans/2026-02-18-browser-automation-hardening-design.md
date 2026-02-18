# Phase 6: Browser Automation Hardening

## Decisions

- **Architecture**: Prompt-driven. No new worker — Claude Code uses `/dev-browser` during its existing execution session.
- **Failure mode**: Retry within session. Claude fixes issues and redeploys, using the existing error-recovery ladder.
- **Test scope**: Full E2E. Every described feature tested end-to-end before marking complete.

## What Changed

### New file: `voice-listener/prompts/browser-testing.md`
Post-deploy verification instructions injected into execution prompts for Project and CodeChange actions. Defines:
- Basic health check (page loads, no console errors)
- Full E2E functional testing (forms, buttons, navigation, data flow, auth, responsive)
- Evidence collection (screenshots)
- Fix-retest loop (diagnose → fix → redeploy → retest)
- Clear pass/fail criteria

### Modified: `voice-listener/prompts/execution.md`
Added `{{BROWSER_TESTING}}` placeholder between `{{SAFEGUARDS}}` and `{{ORCHESTRATION_MODE}}`.

### Modified: `voice-listener/src/action-executor.ts`
- Loads `browser-testing.md` for Project and CodeChange action types
- Passes it as `BROWSER_TESTING` template variable (empty string for other types)

### Modified: `voice-listener/prompts/orchestration-complex.md`
Updated Phase 4 (Integration) to explicitly require browser testing after deployment.

## Completion Criteria

Actions with deployments are only marked complete when the deployed app passes full E2E browser testing. This implements the spec's "Deployed + auto-tested = done" requirement.
