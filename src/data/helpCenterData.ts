export interface HelpArticle {
  id: string;
  categoryId: string;
  title: string;
  summary: string;
  readTime: string;
  tags: string[];
  content: {
    intro: string;
    sections: {
      heading: string;
      body: string[];
      tip?: string;
      warning?: string;
    }[];
    conclusion?: string;
  };
  relatedArticleIds?: string[];
}

export interface HelpCategory {
  id: string;
  title: string;
  description: string;
  iconName: string;
  color: string;
  articles: HelpArticle[];
}

const article = (
  id: string,
  categoryId: string,
  title: string,
  summary: string,
  intro: string,
  sections: HelpArticle['content']['sections'],
  tags: string[],
  relatedArticleIds: string[] = [],
  conclusion?: string,
  readTime = '2 min read',
): HelpArticle => ({
  id,
  categoryId,
  title,
  summary,
  readTime,
  tags,
  content: { intro, sections, conclusion },
  relatedArticleIds,
});

export const HELP_CATEGORIES: HelpCategory[] = [
  {
    id: 'getting-started',
    title: 'Getting Started',
    description: 'Learn the basics of TokenCare, your account, and the main areas of the app.',
    iconName: 'Sparkles',
    color: '#00E575',
    articles: [
      article(
        'what-is-tokencare',
        'getting-started',
        'What is TokenCare?',
        'A simple introduction to TokenCare and what you can do with it.',
        'TokenCare is a token discovery, inspection, and donation platform designed to help users find token information, review available safety signals, and interact with supported token features from one place.',
        [
          {
            heading: 'What TokenCare provides',
            body: [
              '• Token discovery and searchable token information.',
              '• Automated checks that surface detectable contract and token risks.',
              '• Token metadata, market information, and network information when available.',
              '• Token donation and submission workflows supported by the application.',
              '• Account, reward, withdrawal, settings, and support features.'
            ],
            warning: 'TokenCare information and automated checks are not a guarantee that a token is safe, profitable, or free from every possible risk.'
          }
        ],
        ['intro', 'overview', 'basics', 'about'],
        ['how-does-tokencare-work', 'navigating-tokencare']
      ),
      article(
        'how-does-tokencare-work',
        'getting-started',
        'How does TokenCare work?',
        'Understand the normal flow from finding a token to reviewing its information.',
        'TokenCare brings token lookup, contract inspection, market data, metadata, and application features together in a single workflow.',
        [
          {
            heading: 'Typical token workflow',
            body: [
              '1. Find or enter a token contract address.',
              '2. Select or confirm the network when required.',
              '3. Let TokenCare retrieve the available token and contract information.',
              '4. Review the inspection results, metadata, and market information.',
              '5. Continue with the available action, such as saving a token or proceeding with a supported donation workflow.'
            ],
            tip: 'For important transactions, always compare the contract address with the token project’s official source before continuing.'
          }
        ],
        ['workflow', 'how-it-works', 'process', 'tokens'],
        ['what-is-tokencare', 'searching-for-tokens', 'how-token-safety-checks-work'],
        undefined,
        '3 min read'
      ),
      article(
        'creating-an-account',
        'getting-started',
        'Creating an account',
        'How to create your TokenCare account and complete the basic setup.',
        'Your TokenCare account gives you access to account-specific features such as saved information, rewards, settings, and support workflows.',
        [
          {
            heading: 'Create your account',
            body: [
              '1. Open TokenCare and choose the sign-up or get-started option.',
              '2. Enter the information requested by the authentication screen.',
              '3. Complete any email confirmation or verification step shown by the application.',
              '4. After signing in, review your profile and security settings.'
            ],
            warning: 'Never share your password, authentication codes, private keys, or recovery phrases with another person.'
          }
        ],
        ['account', 'registration', 'sign-up', 'register'],
        ['logging-in', 'two-factor-authentication']
      ),
      article(
        'logging-in',
        'getting-started',
        'Logging in',
        'How to sign in and what to do if authentication does not work.',
        'Use the authentication screen to access your TokenCare account. The exact sign-in options shown are determined by the current application configuration.',
        [
          {
            heading: 'Sign in',
            body: [
              '1. Open TokenCare and choose Sign In.',
              '2. Enter the credentials requested by the application.',
              '3. Complete any additional verification step that appears.',
              '4. If sign-in succeeds but your account data does not appear, check your connection and refresh the application.'
            ]
          }
        ],
        ['login', 'signin', 'authentication', 'access'],
        ['login-problems', 'creating-an-account']
      ),
      article(
        'navigating-tokencare',
        'getting-started',
        'Navigating TokenCare',
        'Learn what the main areas of TokenCare are used for on mobile and desktop.',
        'TokenCare provides different layouts for desktop and mobile screens while keeping the main application features available across supported views.',
        [
          {
            heading: 'Main areas',
            body: [
              '• Overview: Your main account and activity summary.',
              '• Explore: Browse and discover available token information.',
              '• Donate: Work with the token donation and inspection flow.',
              '• Tokens: Review tokens associated with your account or submissions.',
              '• Settings: Manage account preferences, security, currency, storage, and support options.'
            ],
            tip: 'On smaller screens, use the bottom navigation to move between the primary areas of the application.'
          }
        ],
        ['navigation', 'mobile', 'desktop', 'tabs', 'ui'],
        ['understanding-the-overview-page']
      ),
      article(
        'understanding-the-overview-page',
        'getting-started',
        'Understanding the Overview page',
        'Learn what the main Overview dashboard is designed to show.',
        'The Overview page gives you a quick view of account-related information and recent application activity without requiring you to open every feature separately.',
        [
          {
            heading: 'What you may see',
            body: [
              '• Your current reward balance and its displayed currency value.',
              '• Token or verification activity available to your account.',
              '• Shortcuts to commonly used TokenCare features.',
              '• Recent activity and account information.'
            ],
            warning: 'Market values and other live information can change as external data sources update.'
          }
        ],
        ['overview', 'dashboard', 'balance', 'activity'],
        ['navigating-tokencare', 'understanding-reward-balance']
      )
    ]
  },
  {
    id: 'tokens',
    title: 'Tokens & Verification',
    description: 'Learn how to find tokens and understand TokenCare’s automated inspection results.',
    iconName: 'Coins',
    color: '#34D399',
    articles: [
      article(
        'searching-for-tokens',
        'tokens',
        'Searching for tokens',
        'Find a token by contract address or available search information.',
        'The safest starting point for identifying a token is its contract address on the correct blockchain network.',
        [
          {
            heading: 'Search by contract address',
            body: [
              '1. Open the token search or Add Token area.',
              '2. Enter the token contract address.',
              '3. Select or confirm the blockchain network if requested.',
              '4. Review the returned token information before continuing.'
            ],
            tip: 'For unfamiliar tokens, verify the contract address using the project’s official website or another trusted source before interacting with it.'
          }
        ],
        ['search', 'contract', 'token', 'explore'],
        ['adding-tokens', 'why-a-token-may-not-appear']
      ),
      article(
        'adding-tokens',
        'tokens',
        'Adding tokens',
        'How to submit a token for TokenCare to inspect and store when the feature is available.',
        'The Add Token flow lets you provide a token contract so TokenCare can retrieve the information and checks supported by the current application.',
        [
          {
            heading: 'Submission flow',
            body: [
              '1. Open the Donate or Add Token area.',
              '2. Choose the appropriate network when required.',
              '3. Enter the token contract address.',
              '4. Start the inspection and wait for the available token information to load.',
              '5. Review the result and save the token only after confirming that the information is correct.'
            ],
            warning: 'An inspection result is an automated signal. It is not a full independent smart-contract security audit.'
          }
        ],
        ['add-token', 'submit', 'contract', 'inspection'],
        ['searching-for-tokens', 'how-token-safety-checks-work']
      ),
      article(
        'what-token-verification-means',
        'tokens',
        'What token verification means',
        'Understand what a TokenCare verification result can and cannot tell you.',
        'TokenCare verification refers to automated checks and available data used to identify specific token and contract signals. It should be treated as a risk-assessment aid, not a guarantee.',
        [
          {
            heading: 'What the checks can evaluate',
            body: [
              '• Contract deployment and basic token-interface information.',
              '• Detectable ownership or privileged-function signals.',
              '• Detectable transfer restrictions, taxes, or other suspicious behavior when the available checks can identify them.',
              '• Token metadata and market information available from supported sources.'
            ],
            warning: 'A verification result does not guarantee safety, future behavior, liquidity, price performance, or the absence of vulnerabilities that the automated checks cannot detect.'
          }
        ],
        ['verification', 'security', 'trust', 'disclaimer'],
        ['understanding-verified-tokens', 'how-token-safety-checks-work']
      ),
      article(
        'understanding-verified-tokens',
        'tokens',
        'Understanding verified tokens',
        'Learn what the TokenCare verification indicator is intended to communicate.',
        'A verified indicator means that the token has passed the applicable TokenCare checks and data requirements used by the current application.',
        [
          {
            heading: 'What the indicator means',
            body: [
              '• It indicates that the configured TokenCare checks produced an acceptable result at the time of inspection.',
              '• It can help users distinguish inspected entries from entries that have not completed the same process.',
              '• It does not mean that the token is endorsed, guaranteed safe, or guaranteed to retain its current characteristics.'
            ],
            warning: 'Token contracts and markets can change after an inspection. Treat the verification indicator as a point-in-time signal.'
          }
        ],
        ['verified', 'badge', 'shield', 'trust'],
        ['what-token-verification-means', 'how-token-safety-checks-work']
      ),
      article(
        'how-token-safety-checks-work',
        'tokens',
        'How TokenCare automated safety checks work',
        'A practical explanation of the automated checks used during token inspection.',
        'TokenCare can combine blockchain RPC data, contract-interface checks, market data, and other configured inspection signals to build a token assessment.',
        [
          {
            heading: 'Inspection stages',
            body: [
              '1. Confirm that the supplied address corresponds to a deployed contract on the selected network.',
              '2. Read available standard token information such as name, symbol, decimals, and supply.',
              '3. Inspect detectable contract and ownership signals supported by the current verification engine.',
              '4. Retrieve available market, metadata, and liquidity information from configured data sources.',
              '5. Present the available results to the user.'
            ],
            warning: 'Automated analysis can miss risks. It should not be described as a complete smart-contract audit or a guarantee that a token is safe.'
          }
        ],
        ['audit', 'static-analysis', 'honeypot', 'rpc', 'checks'],
        ['what-token-verification-means', 'why-a-token-may-not-appear'],
        undefined,
        '4 min read'
      ),
      article(
        'understanding-token-details',
        'tokens',
        'Understanding token details',
        'Learn how to read the information shown for a token.',
        'Token detail screens bring together the token information that TokenCare can retrieve from the blockchain and supported data providers.',
        [
          {
            heading: 'Common information',
            body: [
              '• Token name and symbol.',
              '• Contract address and network.',
              '• Decimals and supply information when available.',
              '• Current or recent market information when available.',
              '• Inspection and verification signals.'
            ],
            tip: 'Always confirm the network and contract address before treating token information as belonging to a particular project.'
          }
        ],
        ['token-details', 'metadata', 'contract', 'market'],
        ['searching-for-tokens', 'what-token-verification-means']
      ),
      article(
        'why-a-token-may-not-appear',
        'tokens',
        'Why a token may not appear',
        'Troubleshoot missing tokens, missing metadata, or incomplete inspection results.',
        'A token may fail to appear because the contract, network, metadata provider, market source, or application cache did not return usable information.',
        [
          {
            heading: 'Common causes',
            body: [
              '• The contract address is incorrect or belongs to another network.',
              '• The contract does not expose the expected token information.',
              '• A data provider has not indexed the token yet.',
              '• The token has little or no available market data.',
              '• Cached application data is stale.'
            ],
            tip: 'Confirm the contract address and network first. If the problem continues, clear cached data from Settings and try again.'
          }
        ],
        ['missing', 'token', 'search', 'metadata', 'troubleshooting'],
        ['clear-storage', 'token-information-not-updating']
      )
    ]
  },
  {
    id: 'donations',
    title: 'Donations & Withdrawals',
    description: 'Understand supported donation and reward withdrawal flows without making financial guarantees.',
    iconName: 'Heart',
    color: '#F472B6',
    articles: [
      article(
        'donating-tokens',
        'donations',
        'How token donations work',
        'Understand the donation flow before confirming a transaction.',
        'TokenCare can provide a donation workflow for supported tokens and networks. The exact steps shown depend on the token and current application configuration.',
        [
          {
            heading: 'Before confirming a donation',
            body: [
              '1. Confirm the token and blockchain network.',
              '2. Review the recipient and amount shown by the application.',
              '3. Check any network or transaction information presented before confirmation.',
              '4. Only approve the transaction when all details are correct.',
              '5. Wait for the transaction result before assuming the donation is complete.'
            ],
            warning: 'Blockchain transactions can be irreversible. TokenCare does not guarantee that a mistaken transaction can be recovered.'
          }
        ],
        ['donate', 'donation', 'transaction', 'tokens'],
        ['understanding-token-details']
      ),
      article(
        'understanding-reward-balance',
        'donations',
        'Understanding your reward balance',
        'Learn how the reward balance shown in TokenCare should be interpreted.',
        'Your reward balance represents the rewards recorded for your account by the application. The displayed fiat value is an estimate based on the configured currency and available conversion data.',
        [
          {
            heading: 'Balance and displayed value',
            body: [
              '• The token amount is the primary balance shown by the application.',
              '• The fiat value is a conversion and can change when the underlying rate changes.',
              '• Changing the selected currency changes the way the fiat value is displayed; it does not change the underlying token amount.'
            ],
            warning: 'Displayed market or conversion values are estimates and should not be treated as guaranteed payout values.'
          }
        ],
        ['rewards', 'balance', 'currency', 'fiat'],
        ['withdrawing-rewards', 'currency-settings']
      ),
      article(
        'withdrawing-rewards',
        'donations',
        'Withdrawing rewards',
        'Understand the reward withdrawal process and the information you should check before submitting it.',
        'The withdrawal screen is used to request a payout of eligible rewards. The exact minimum, destination, and status rules are determined by the current application configuration.',
        [
          {
            heading: 'Before submitting a withdrawal',
            body: [
              '• Check the available reward balance.',
              '• Confirm the payout destination shown by the application.',
              '• Review the minimum amount and any network or processing information shown on the screen.',
              '• Confirm the request only when all details are correct.'
            ],
            warning: 'Do not rely on a fixed USD amount shown in older documentation. The application should display the minimum and converted values using the user’s selected currency.'
          }
        ],
        ['withdraw', 'payout', 'rewards', 'minimum'],
        ['understanding-reward-balance', 'currency-settings'],
        undefined,
        '3 min read'
      )
    ]
  },
  {
    id: 'account-settings',
    title: 'Account & Settings',
    description: 'Manage security, preferences, currency, notifications, and local application data.',
    iconName: 'Settings',
    color: '#60A5FA',
    articles: [
      article(
        'two-factor-authentication',
        'account-settings',
        'Two-factor authentication',
        'Learn how TokenCare’s additional account security works when enabled.',
        'Two-factor authentication adds another verification step to your account. If the feature is enabled for your account, follow the setup and verification instructions shown in Settings.',
        [
          {
            heading: 'Security guidance',
            body: [
              '• Use an authenticator method supported by the application.',
              '• Keep recovery information in a secure place.',
              '• Never share one-time authentication codes with another person.'
            ],
            warning: 'If you lose access to your authenticator, use the recovery options provided by TokenCare rather than sending your authentication code to support.'
          }
        ],
        ['2fa', 'security', 'authentication', 'account'],
        ['creating-an-account', 'login-problems']
      ),
      article(
        'currency-settings',
        'account-settings',
        'Changing your display currency',
        'How the selected currency affects values shown throughout TokenCare.',
        'TokenCare can display supported fiat conversions using the currency selected in Settings.',
        [
          {
            heading: 'What changes',
            body: [
              '• Converted balance values use the selected currency when conversion data is available.',
              '• Minimum and other monetary values should follow the selected display currency where the feature supports conversion.',
              '• Changing currency does not change the underlying token or reward balance.'
            ],
            tip: 'If a page continues to show USD after changing your currency, refresh the page. If it still does not update, report the specific screen to support.'
          }
        ],
        ['currency', 'fiat', 'settings', 'conversion'],
        ['understanding-reward-balance', 'withdrawing-rewards']
      ),
      article(
        'clear-storage',
        'account-settings',
        'Clear Storage',
        'Learn what clearing local application storage is intended to do.',
        'Clear Storage removes cached or locally stored application data so TokenCare can request fresh records the next time the relevant features load.',
        [
          {
            heading: 'When to use it',
            body: [
              '• Token information appears outdated.',
              '• A cached screen is behaving unexpectedly.',
              '• You want the application to rebuild local cached data.'
            ],
            warning: 'Clearing local storage can remove locally cached preferences or temporary data. It does not delete blockchain transactions or server-side records unless the application explicitly says otherwise.'
          }
        ],
        ['storage', 'cache', 'clear', 'settings'],
        ['why-a-token-may-not-appear', 'token-information-not-updating']
      )
    ]
  },
  {
    id: 'troubleshooting',
    title: 'Troubleshooting & Support',
    description: 'Practical help for common problems and guidance on reporting issues.',
    iconName: 'AlertTriangle',
    color: '#F59E0B',
    articles: [
      article(
        'app-not-loading',
        'troubleshooting',
        'The app is not loading',
        'Steps to take when TokenCare does not load correctly.',
        'Loading problems can be caused by connectivity, cached data, an unavailable service, or a temporary application error.',
        [
          {
            heading: 'Try these steps',
            body: [
              '1. Check that your internet connection is working.',
              '2. Refresh or restart the application.',
              '3. If the problem continues, use Clear Storage in Settings and try again.',
              '4. If only one feature fails, note the exact screen and action that caused the problem.',
              '5. Contact support if the problem remains reproducible.'
            ]
          }
        ],
        ['loading', 'error', 'app', 'network'],
        ['clear-storage', 'reporting-a-problem']
      ),
      article(
        'token-information-not-updating',
        'troubleshooting',
        'Token information is not updating',
        'Troubleshoot stale prices, metadata, or token information.',
        'Token information may come from multiple external and blockchain data sources, so updates can sometimes be delayed or unavailable.',
        [
          {
            heading: 'What to check',
            body: [
              '• Confirm the correct network and contract address.',
              '• Refresh the token screen.',
              '• Clear cached application data if the information remains stale.',
              '• Check whether the issue affects one token or many tokens.'
            ],
            tip: 'When reporting the problem, include the network, contract address, and the exact information that is stale.'
          }
        ],
        ['price', 'metadata', 'stale', 'update'],
        ['clear-storage', 'reporting-a-problem']
      ),
      article(
        'login-problems',
        'troubleshooting',
        'Login problems',
        'Troubleshoot common authentication and session problems.',
        'If you cannot sign in, first determine whether the problem is with your credentials, verification step, connection, or the application session.',
        [
          {
            heading: 'Troubleshooting',
            body: [
              '1. Confirm that you are using the correct account credentials.',
              '2. Complete any email or additional authentication step requested.',
              '3. Check your internet connection.',
              '4. Restart the application and try again.',
              '5. If the problem persists, contact support without sharing your password or authentication codes.'
            ],
            warning: 'Support should never need your password, one-time authentication code, private key, or recovery phrase.'
          }
        ],
        ['login', 'password', 'session', 'authentication'],
        ['logging-in', 'two-factor-authentication', 'reporting-a-problem']
      ),
      article(
        'unexpected-app-behavior',
        'troubleshooting',
        'Unexpected app behavior',
        'What to do when a button, screen, or feature behaves unexpectedly.',
        'When something behaves unexpectedly, the most useful first step is to determine whether it is a one-time display issue or a repeatable application problem.',
        [
          {
            heading: 'Collect useful information',
            body: [
              '• The page or feature where the problem occurred.',
              '• The exact action you performed immediately before it happened.',
              '• Any error message displayed.',
              '• Whether the issue happens every time or only once.',
              '• Whether refreshing or restarting fixes it.'
            ]
          }
        ],
        ['bug', 'error', 'unexpected', 'support'],
        ['reporting-a-problem']
      ),
      article(
        'reporting-a-problem',
        'troubleshooting',
        'Reporting a problem',
        'How to send a useful bug report to the TokenCare support team.',
        'A clear bug report helps the team reproduce and diagnose the problem faster.',
        [
          {
            heading: 'Include these details',
            body: [
              '1. The name of the page or feature.',
              '2. The steps you took before the problem occurred.',
              '3. The exact error message, if any.',
              '4. Your device and whether you were using the web app or Android app.',
              '5. A screenshot when it helps explain the problem.'
            ],
            warning: 'Do not include passwords, authentication codes, private keys, seed phrases, or other confidential credentials in a bug report.'
          }
        ],
        ['bug', 'report', 'support', 'feedback'],
        ['unexpected-app-behavior', 'app-not-loading'],
        'The more specific the report, the easier it is to investigate.'
      )
    ]
  }
];

export function searchHelpArticles(query: string): { article: HelpArticle; category: HelpCategory }[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return [];

  const results: { article: HelpArticle; category: HelpCategory }[] = [];

  for (const category of HELP_CATEGORIES) {
    for (const helpArticle of category.articles) {
      const searchable = [
        helpArticle.title,
        helpArticle.summary,
        helpArticle.tags.join(' '),
        helpArticle.content.intro,
        ...helpArticle.content.sections.flatMap((section) => [
          section.heading,
          ...section.body,
          section.tip || '',
          section.warning || '',
        ]),
      ]
        .join(' ')
        .toLowerCase();

      if (searchable.includes(normalized)) {
        results.push({ article: helpArticle, category });
      }
    }
  }

  return results;
}

export function getHelpArticleById(id: string): { article: HelpArticle; category: HelpCategory } | null {
  for (const category of HELP_CATEGORIES) {
    const helpArticle = category.articles.find((item) => item.id === id);
    if (helpArticle) return { article: helpArticle, category };
  }

  return null;
}
