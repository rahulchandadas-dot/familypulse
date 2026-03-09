/**
 * Approved Medical Sources Registry
 *
 * WHITELIST POLICY:
 * FamilyPulse only cites sources from this approved list. All LLM-generated
 * recommendations and chat responses are instructed to reference only sources
 * from this registry. Any citation not in this list will be stripped before
 * display. This prevents hallucinated or unapproved medical references from
 * reaching users.
 *
 * Approved organizations: CDC, NIH, MedlinePlus, NHS, WHO, Mayo Clinic,
 * Cleveland Clinic, American Heart Association, American Academy of Sleep Medicine,
 * ACSM, Harvard Health, and similar evidence-based public health sources.
 */

export interface ApprovedSource {
  id: string
  organization: string
  name: string
  url: string
  topics: string[]
  description: string
}

// ============================================================
// APPROVED SOURCES REGISTRY
// ============================================================

/**
 * Curated list of approved, reputable medical and wellness sources.
 * Each entry has a stable ID, organization name, URL, and topic tags
 * for retrieval matching.
 */
export const APPROVED_SOURCES: ApprovedSource[] = [
  {
    id: 'cdc-physical-activity',
    organization: 'CDC',
    name: 'Physical Activity Basics – CDC',
    url: 'https://www.cdc.gov/physicalactivity/basics/index.htm',
    topics: ['steps', 'activity', 'activity_minutes', 'exercise', 'calories_burned'],
    description: 'CDC guidelines on physical activity for adults and children, including recommended weekly minutes of moderate and vigorous activity.',
  },
  {
    id: 'cdc-sleep',
    organization: 'CDC',
    name: 'Sleep and Sleep Disorders – CDC',
    url: 'https://www.cdc.gov/sleep/index.html',
    topics: ['sleep', 'sleep_hours', 'sleep_duration', 'fatigue', 'insomnia'],
    description: 'CDC resources on sleep health, recommended sleep durations by age group, and the health effects of insufficient sleep.',
  },
  {
    id: 'cdc-heart-disease',
    organization: 'CDC',
    name: 'Heart Disease – CDC',
    url: 'https://www.cdc.gov/heartdisease/index.htm',
    topics: ['heart', 'resting_heart_rate', 'blood_oxygen', 'cardiovascular', 'hrv'],
    description: 'CDC heart disease facts, risk factors, prevention strategies, and heart rate health information.',
  },
  {
    id: 'nih-stress',
    organization: 'NIH',
    name: 'Stress – National Institute of Mental Health (NIH)',
    url: 'https://www.nimh.nih.gov/health/topics/caring-for-your-mental-health',
    topics: ['stress', 'stress_score', 'mental_health', 'anxiety', 'recovery'],
    description: 'NIH guidance on recognizing and managing stress, its effects on physical health, and evidence-based coping strategies.',
  },
  {
    id: 'nih-sleep',
    organization: 'NIH',
    name: 'Sleep Deprivation and Deficiency – NIH',
    url: 'https://www.nhlbi.nih.gov/health/sleep-deprivation',
    topics: ['sleep', 'sleep_hours', 'readiness_score', 'recovery', 'hrv'],
    description: 'NIH National Heart, Lung, and Blood Institute guidance on sleep requirements, effects of sleep deficiency, and tips for healthy sleep.',
  },
  {
    id: 'medlineplus-hrv',
    organization: 'MedlinePlus',
    name: 'Heart Rate Variability – MedlinePlus',
    url: 'https://medlineplus.gov/lab-tests/heart-rate-variability-hrv/',
    topics: ['hrv', 'heart_rate_variability', 'autonomic_nervous_system', 'recovery', 'stress'],
    description: 'MedlinePlus explanation of HRV, what it measures, normal values, and what low or high HRV may indicate.',
  },
  {
    id: 'medlineplus-blood-oxygen',
    organization: 'MedlinePlus',
    name: 'Pulse Oximetry (Blood Oxygen) – MedlinePlus',
    url: 'https://medlineplus.gov/lab-tests/pulse-oximetry/',
    topics: ['blood_oxygen', 'spo2', 'oxygen_saturation', 'respiratory'],
    description: 'MedlinePlus guide to blood oxygen saturation (SpO2), normal ranges, and when low readings require attention.',
  },
  {
    id: 'medlineplus-glucose',
    organization: 'MedlinePlus',
    name: 'Blood Glucose Test – MedlinePlus',
    url: 'https://medlineplus.gov/lab-tests/blood-glucose-test/',
    topics: ['glucose', 'blood_glucose', 'blood_sugar', 'nutrition', 'diabetes'],
    description: 'MedlinePlus guidance on blood glucose levels, normal fasting ranges, and what abnormal results may indicate.',
  },
  {
    id: 'nhs-physical-activity',
    organization: 'NHS',
    name: 'Physical Activity Guidelines for Adults – NHS',
    url: 'https://www.nhs.uk/live-well/exercise/exercise-guidelines/physical-activity-guidelines-for-adults-aged-19-to-64/',
    topics: ['activity', 'steps', 'exercise', 'activity_minutes', 'calories_burned'],
    description: 'NHS UK physical activity recommendations for adults including aerobic and strength training guidelines.',
  },
  {
    id: 'aha-heart-rate',
    organization: 'American Heart Association',
    name: 'All About Heart Rate – American Heart Association',
    url: 'https://www.heart.org/en/health-topics/high-blood-pressure/the-facts-about-high-blood-pressure/all-about-heart-rate-pulse',
    topics: ['resting_heart_rate', 'heart_rate', 'cardiovascular', 'heart'],
    description: 'AHA guide to normal resting heart rate ranges, what affects heart rate, and when to be concerned.',
  },
  {
    id: 'aasm-sleep-guidelines',
    organization: 'American Academy of Sleep Medicine',
    name: 'Sleep Duration Recommendations – AASM',
    url: 'https://aasm.org/resources/clinicalguidelines/sleepduration.pdf',
    topics: ['sleep', 'sleep_hours', 'sleep_duration', 'children_sleep', 'adult_sleep'],
    description: 'AASM consensus sleep duration recommendations for different age groups from infants to adults.',
  },
  {
    id: 'who-physical-activity',
    organization: 'WHO',
    name: 'Physical Activity – World Health Organization',
    url: 'https://www.who.int/news-room/fact-sheets/detail/physical-activity',
    topics: ['activity', 'steps', 'exercise', 'sedentary', 'activity_minutes'],
    description: 'WHO global recommendations on physical activity levels for health, including risks of physical inactivity.',
  },
  {
    id: 'harvard-sleep',
    organization: 'Harvard Health',
    name: 'Sleep and Health – Harvard Medical School',
    url: 'https://www.health.harvard.edu/topics/sleep',
    topics: ['sleep', 'sleep_hours', 'hrv', 'recovery', 'readiness_score', 'stress'],
    description: 'Harvard Medical School evidence-based articles on sleep science, sleep hygiene tips, and sleep\'s role in overall health.',
  },
  {
    id: 'cdc-nutrition',
    organization: 'CDC',
    name: 'Nutrition – CDC',
    url: 'https://www.cdc.gov/nutrition/index.html',
    topics: ['nutrition', 'glucose', 'blood_sugar', 'calories', 'diet'],
    description: 'CDC nutrition resources covering healthy eating patterns, blood sugar management, and dietary guidelines.',
  },
  {
    id: 'cleveland-clinic-hrv',
    organization: 'Cleveland Clinic',
    name: 'Heart Rate Variability (HRV) – Cleveland Clinic',
    url: 'https://my.clevelandclinic.org/health/symptoms/21773-heart-rate-variability-hrv',
    topics: ['hrv', 'heart_rate_variability', 'stress', 'recovery', 'autonomic_nervous_system'],
    description: 'Cleveland Clinic patient-friendly guide to HRV, factors that affect it, and how it relates to stress and recovery.',
  },
]

// ============================================================
// SOURCE LOOKUP UTILITIES
// ============================================================

/** Normalized approved domain set for fast URL validation */
const APPROVED_DOMAINS = new Set([
  'cdc.gov',
  'nih.gov',
  'nimh.nih.gov',
  'nhlbi.nih.gov',
  'medlineplus.gov',
  'nhs.uk',
  'heart.org',
  'aasm.org',
  'who.int',
  'health.harvard.edu',
  'clevelandclinic.org',
  'mayoclinic.org',
  'acsm.org',
  'healthline.com',
])

/**
 * Checks whether a URL belongs to an approved medical source.
 * Uses domain matching against the approved domain whitelist.
 *
 * @param url - URL string to validate
 * @returns true if the URL domain is on the approved list
 */
export function isApprovedSource(url: string): boolean {
  try {
    const parsed = new URL(url)
    const hostname = parsed.hostname.replace(/^www\./, '')
    return APPROVED_DOMAINS.has(hostname) ||
      [...APPROVED_DOMAINS].some(domain => hostname.endsWith(`.${domain}`))
  } catch {
    return false
  }
}

/**
 * Returns approved sources relevant to a given topic or metric.
 * Matches against the topic_tags array of each source.
 *
 * @param topic - Topic string to search for (partial match)
 * @returns Array of matching ApprovedSource entries
 */
export function getSourcesByTopic(topic: string): ApprovedSource[] {
  const topicLower = topic.toLowerCase().replace(/[\s-]/g, '_')
  return APPROVED_SOURCES.filter(source =>
    source.topics.some(t =>
      t.toLowerCase().includes(topicLower) || topicLower.includes(t.toLowerCase())
    )
  )
}

/**
 * Returns all sources from a specific organization.
 *
 * @param organization - Organization name (case-insensitive)
 */
export function getSourcesByOrganization(organization: string): ApprovedSource[] {
  const orgLower = organization.toLowerCase()
  return APPROVED_SOURCES.filter(s => s.organization.toLowerCase() === orgLower)
}

/**
 * Looks up a source by its stable ID.
 *
 * @param id - The source's stable ID string
 */
export function getSourceById(id: string): ApprovedSource | undefined {
  return APPROVED_SOURCES.find(s => s.id === id)
}

/**
 * Returns sources relevant to multiple topics/metric keys.
 * Deduplicates results and ranks by number of matching topics.
 *
 * @param topics - Array of topic strings or metric keys
 * @returns Deduplicated, relevance-ranked array of ApprovedSource
 */
export function getSourcesForTopics(topics: string[]): ApprovedSource[] {
  const scoreMap = new Map<string, { source: ApprovedSource; score: number }>()

  for (const topic of topics) {
    for (const source of getSourcesByTopic(topic)) {
      const existing = scoreMap.get(source.id)
      if (existing) {
        existing.score++
      } else {
        scoreMap.set(source.id, { source, score: 1 })
      }
    }
  }

  return [...scoreMap.values()]
    .sort((a, b) => b.score - a.score)
    .map(entry => entry.source)
}
