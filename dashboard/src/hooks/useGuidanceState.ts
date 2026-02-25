'use client';
import { useState, useEffect, useCallback } from 'react';
import { useProducts, useIntegrations } from './useAPI';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4001';

export type ActionId =
  | 'add_product'
  | 'connect_integration'
  | 'run_keyword_discovery'
  | 'generate_first_content'
  | 'setup_email_nurture'
  | 'scale_experiment_winner'
  | 'refresh_decaying_content';

function lsGet(key: string) {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(key);
}
function lsSet(key: string, val: string) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(key, val);
}

export function useGuidanceState() {
  const { data: products } = useProducts();
  const { data: integrations } = useIntegrations();

  const [onboardingStatus, setOnboardingStatus] = useState<any>(null);
  const [keywordCount, setKeywordCount] = useState(0);
  const [experimentWinners, setExperimentWinners] = useState<any[]>([]);

  // wizard
  const [wizardCompleted, setWizardCompleted] = useState(false);
  const [wizardDismissed, setWizardDismissed] = useState(false);

  // page intro dismissals (keyed by page name)
  const [introDismissals, setIntroDismissals] = useState<Record<string, boolean>>({});

  // current action dismissal
  const [dismissedActions, setDismissedActions] = useState<Record<string, boolean>>({});

  useEffect(() => {
    // Read localStorage on mount
    setWizardCompleted(lsGet('wizard_completed') === '1');
    setWizardDismissed(lsGet('wizard_dismissed') === '1');

    // Load all page intro dismissals
    const pages = ['overview','products','keywords','content','leads','revenue','experiments','agents','social','playbooks'];
    const dismissals: Record<string, boolean> = {};
    pages.forEach(p => { dismissals[p] = lsGet(`page_intro_${p}`) === '1'; });
    setIntroDismissals(dismissals);

    // Load all action dismissals
    const actionIds: ActionId[] = ['add_product','connect_integration','run_keyword_discovery','generate_first_content','setup_email_nurture','scale_experiment_winner','refresh_decaying_content'];
    const dismissed: Record<string, boolean> = {};
    actionIds.forEach(id => { dismissed[id] = lsGet(`action_dismissed_${id}`) === '1'; });
    setDismissedActions(dismissed);
  }, []);

  // Fetch onboarding status, keywords count, experiment winners
  useEffect(() => {
    fetch(`${API_BASE}/api/onboarding/status`)
      .then(r => r.json()).then(setOnboardingStatus).catch(() => {});

    fetch(`${API_BASE}/api/keywords`)
      .then(r => r.json())
      .then(d => setKeywordCount(Array.isArray(d) ? d.length : 0))
      .catch(() => {});

    fetch(`${API_BASE}/api/experiments`)
      .then(r => r.json())
      .then(d => setExperimentWinners(Array.isArray(d) ? d.filter((e: any) => e.status === 'winner_found') : []))
      .catch(() => {});
  }, []);

  // Derived state
  const hasProduct = Array.isArray(products) && products.length > 0;
  const hasIntegration = Array.isArray(integrations) && integrations.some((i: any) => i.enabled);
  const hasContent = onboardingStatus?.has_content ?? false;
  const hasNurtureSequence = onboardingStatus?.has_nurture ?? false;
  const hasExperimentWinner = experimentWinners.length > 0;

  // Priority action logic
  function computeCurrentAction(): ActionId | null {
    if (!hasProduct) return 'add_product';
    if (!hasIntegration) return 'connect_integration';
    if (keywordCount === 0) return 'run_keyword_discovery';
    if (!hasContent) return 'generate_first_content';
    if (!hasNurtureSequence) return 'setup_email_nurture';
    if (hasExperimentWinner) return 'scale_experiment_winner';
    return null;
  }
  const currentAction = computeCurrentAction();
  const actionDismissed = currentAction ? (dismissedActions[currentAction] ?? false) : false;

  // Wizard helpers
  const completeWizard = useCallback(() => {
    lsSet('wizard_completed', '1');
    setWizardCompleted(true);
  }, []);
  const dismissWizard = useCallback(() => {
    lsSet('wizard_dismissed', '1');
    setWizardDismissed(true);
  }, []);

  // Page intro helpers
  const isPageIntroDismissed = useCallback((page: string) => {
    return introDismissals[page] ?? false;
  }, [introDismissals]);
  const dismissPageIntro = useCallback((page: string) => {
    lsSet(`page_intro_${page}`, '1');
    setIntroDismissals(prev => ({ ...prev, [page]: true }));
  }, []);

  // Action bar dismiss
  const dismissAction = useCallback((actionId: ActionId) => {
    lsSet(`action_dismissed_${actionId}`, '1');
    setDismissedActions(prev => ({ ...prev, [actionId]: true }));
  }, []);

  return {
    // raw
    products: Array.isArray(products) ? products : [],
    integrations: Array.isArray(integrations) ? integrations : [],
    experimentWinners,
    onboardingStatus,
    // computed
    hasProduct,
    hasIntegration,
    keywordCount,
    hasContent,
    hasNurtureSequence,
    hasExperimentWinner,
    // wizard
    wizardCompleted,
    wizardDismissed,
    completeWizard,
    dismissWizard,
    // action bar
    currentAction,
    actionDismissed,
    dismissAction,
    // page intro
    isPageIntroDismissed,
    dismissPageIntro,
  };
}
