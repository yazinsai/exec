BROWSER TESTING — Post-Deploy Verification (REQUIRED)

After deploying a web app, you MUST verify it works before marking the action complete. An untested deployment is not complete.

**Use the /dev-browser skill** to test the live deployed app at the deployUrl.

## Testing Protocol

### 1. Basic Health Check
- Navigate to the deployed URL
- Verify the page loads (no error pages, blank screens, or crash loops)
- Check for console errors — open the browser console and look for red errors
- Verify the page title and key elements render correctly

### 2. Full E2E Functional Testing
Test every feature described in the action's title and description:
- **Navigation**: Click all links and nav items, verify they lead somewhere real
- **Forms**: Fill out every form field, submit, verify success/error states
- **Buttons**: Click every interactive element, verify the expected behavior
- **Data flow**: If the app creates/reads/updates/deletes data, test the full CRUD cycle
- **Auth flows**: If there's login/signup, test the complete flow
- **Responsive**: Check at mobile and desktop viewport sizes if relevant
- **Edge cases**: Empty states, error states, loading states

### 3. Evidence Collection
- Take screenshots of key states (landing page, main features, success states)
- Note any issues found, even minor ones

### 4. Fix-Retest Loop
If ANY test fails:
1. Diagnose the issue (check console errors, network requests, server logs)
2. Fix the code
3. Redeploy
4. Retest from the beginning
5. Repeat until all tests pass

Do NOT mark the action as complete until the deployed app passes all tests.

### 5. Completion
Only after all tests pass:
1. Call `"$ACTION_CLI" result "..."` with a summary that includes what was tested
2. The result should mention: "Deployed and verified at [URL]" with key test results

## What Counts as a Test Failure
- Page doesn't load or shows error page
- Console errors (warnings are OK, errors are not)
- Any described feature doesn't work
- Forms submit but nothing happens
- Buttons are unresponsive or broken
- Data isn't persisted correctly
- Layout is completely broken (minor styling issues are OK)

## What Counts as Passing
- All described features work end-to-end
- No console errors
- Page loads in reasonable time
- Core user flows complete successfully
