import * as React from 'react';
import { getAuthRuntime } from '../../auth/runtime/AuthRuntime.js';
import type { ResolvedAuthSession } from '../../auth/runtime/types.js';
import type { LocalJSXCommandContext } from '../../commands.js';
import { getCodeWebBaseUrl } from '../../constants/product.js';
import { getOauthProfileFromOauthToken } from '../../services/oauth/getOauthProfile.js';
import type { LocalJSXCommandOnDone } from '../../types/command.js';
import { openBrowser } from '../../utils/browser.js';
import { logError } from '../../utils/log.js';
import { Login } from '../login/login.js';

type ManagedUpgradeSession = null | Pick<
  ResolvedAuthSession,
  'accessToken' | 'principalSource' | 'sessionState' | 'subscription'
>

export async function isHighestManagedMaxPlanForSession(
  session: ManagedUpgradeSession,
  fetchProfileFromAccessToken: typeof getOauthProfileFromOauthToken = getOauthProfileFromOauthToken,
): Promise<boolean> {
  if (session?.principalSource !== 'managed_oauth') {
    return false
  }

  if (
    session.subscription.subscriptionType === 'max' &&
    session.subscription.rateLimitTier === 'default_claude_max_20x'
  ) {
    return true
  }

  if (session.sessionState !== 'usable' || !session.accessToken) {
    return false
  }

  const profile = await fetchProfileFromAccessToken(session.accessToken)
  return (
    profile?.organization?.organization_type === 'claude_max' &&
    profile?.organization?.rate_limit_tier === 'default_claude_max_20x'
  )
}

export async function call(onDone: LocalJSXCommandOnDone, context: LocalJSXCommandContext): Promise<React.ReactNode | null> {
  try {
    // Check if user is already on the highest Max plan (20x)
    const managedSession = getAuthRuntime().getCurrentManagedSession();
    if (managedSession) {
      const isMax20x = await isHighestManagedMaxPlanForSession(managedSession);
      if (isMax20x) {
        setTimeout(onDone, 0, 'You are already on the highest Max subscription plan. For additional usage, run /login to switch to an API usage-billed account.');
        return null;
      }
    }
    const url = `${getCodeWebBaseUrl()}/billing`;
    await openBrowser(url);
    return <Login startingMessage={'Starting new login following /upgrade. Exit with Ctrl-C to use existing account.'} onDone={success => {
      context.onChangeAPIKey();
      onDone(success ? 'Login successful' : 'Login interrupted');
    }} />;
  } catch (error) {
    logError(error as Error);
    setTimeout(onDone, 0, `Failed to open browser. Please visit ${getCodeWebBaseUrl()}/billing to manage billing.`);
  }
  return null;
}
