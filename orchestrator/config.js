import dotenv from 'dotenv';
dotenv.config({ path: '/var/www/html/lsc_marketing_automation/.env' });

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3001', 10),

  db: {
    host:     process.env.DB_HOST     || 'localhost',
    port:     parseInt(process.env.DB_PORT || '5432', 10),
    name:     process.env.DB_NAME     || 'lsc_marketing',
    user:     process.env.DB_USER     || 'lsc_user',
    password: process.env.DB_PASSWORD || 'lsc_password',
  },

  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
  },

  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
    model:  process.env.OPENAI_MODEL   || 'gpt-4o-mini',
  },

  integrations: {
    gscCredentials:  process.env.GSC_CREDENTIALS_PATH  || '',
    ahrefs:          { apiKey: process.env.AHREFS_API_KEY  || '' },
    semrush:         { apiKey: process.env.SEMRUSH_API_KEY || '' },
    hubspot:         { apiKey: process.env.HUBSPOT_API_KEY || '' },
    sendgrid:        { apiKey: process.env.SENDGRID_API_KEY || '' },
    linkedin:        {
      clientId:     process.env.LINKEDIN_CLIENT_ID     || '',
      clientSecret: process.env.LINKEDIN_CLIENT_SECRET || '',
      accessToken:  process.env.LINKEDIN_ACCESS_TOKEN  || '',
    },
    twitter: {
      bearerToken:  process.env.TWITTER_BEARER_TOKEN  || '',
      apiKey:       process.env.TWITTER_API_KEY        || '',
      apiSecret:    process.env.TWITTER_API_SECRET     || '',
      accessToken:  process.env.TWITTER_ACCESS_TOKEN   || '',
      accessSecret: process.env.TWITTER_ACCESS_SECRET  || '',
    },
    slack: {
      webhookUrl: process.env.SLACK_WEBHOOK_URL || '',
    },
    twilio: {
      accountSid:  process.env.TWILIO_ACCOUNT_SID  || '',
      authToken:   process.env.TWILIO_AUTH_TOKEN   || '',
      fromNumber:  process.env.TWILIO_FROM_NUMBER  || '',
      salesNumber: process.env.SALES_PHONE_NUMBER  || '',
    },
    cms: {
      type:         process.env.CMS_TYPE          || '',   // 'wordpress'|'ghost'|'webflow'
      url:          process.env.CMS_URL           || '',   // base URL, no trailing slash
      // WordPress
      username:     process.env.CMS_USERNAME      || '',
      appPassword:  process.env.CMS_APP_PASSWORD  || '',
      // Ghost
      adminApiKey:  process.env.GHOST_ADMIN_KEY   || '',
      // Webflow
      apiToken:     process.env.WEBFLOW_API_TOKEN || '',
      collectionId: process.env.WEBFLOW_COLLECTION_ID || '',
    },
    ga4: {
      propertyId:   process.env.GA4_PROPERTY_ID     || '',
      credentials:  process.env.GA4_CREDENTIALS_PATH || '',
    },
  },

  pythonApiUrl: process.env.PYTHON_API_URL || 'http://localhost:8000',

  budget: {
    monthlyUsd: parseFloat(process.env.MONTHLY_AI_BUDGET_USD || '500'),
  },

  guardrails: {
    maxWeeklyAiCostUsd:   parseFloat(process.env.MAX_WEEKLY_AI_COST_USD   || '50'),
    maxContentPerDay:     parseInt(process.env.MAX_CONTENT_PER_DAY        || '10', 10),
    brandToneKeywords:    (process.env.BRAND_TONE_KEYWORDS    || '').split(',').filter(Boolean),
    blockedTopics:        (process.env.BLOCKED_TOPICS         || '').split(',').filter(Boolean),
    minConfidenceToScale: parseFloat(process.env.MIN_CONFIDENCE_TO_SCALE  || '0.90'),
  },

  business: {
    companyName:    process.env.COMPANY_NAME    || 'LSC',
    domain:         process.env.DOMAIN          || 'example.com',
    icp:            process.env.ICP             || 'B2B SaaS founders and marketing leaders',
    valueProposition: process.env.VALUE_PROP    || 'Autonomous revenue growth without paid ads',
    targetMrrUsd:   parseFloat(process.env.TARGET_MRR_USD  || '50000'),
    avgDealSizeUsd: parseFloat(process.env.AVG_DEAL_SIZE_USD || '2000'),
  },
};
