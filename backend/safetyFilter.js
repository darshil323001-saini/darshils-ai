// DARSHIL'S AI — Safety & Crisis Response Engine
// Implements strict safety guardrails for self-harm, suicide, and immediate emergencies.

const CRISIS_PATTERNS = [
  /\b(suicide|suicidal|kill\s*myself|end\s*my\s*life|want\s*to\s*die|don'?t\s*want\s*to\s*live|cut\s*myself|self\s*harm|harming\s*myself|overdose|slit\s*my\s*wrist|hang\s*myself|jump\s*off|take\s*my\s*own\s*life)\b/i,
  /\b(mar\s*jaana\s*chahta|jaan\s*dena|khudkushi|aatmhatya|khud\s*ko\s*marna|zindagi\s*khatam|suicide\s*karna)\b/i,
  /\b(no\s*reason\s*to\s*live|better\s*off\s*dead|tired\s*of\s*living|can'?t\s*go\s*on\s*anymore|ending\s*it\s*all)\b/i
];

const EMERGENCY_RESOURCES = {
  india: [
    {
      name: "Immediate Emergency (Police / Medical / Fire)",
      number: "112",
      badge: "Emergency",
      desc: "For immediate, life-threatening danger across all states in India."
    },
    {
      name: "Tele-MANAS (Govt. of India 24/7 Mental Health Helpline)",
      number: "14416 / 1800-891-4416",
      badge: "Toll-Free 24/7",
      desc: "Comprehensive mental health support in multiple Indian languages."
    },
    {
      name: "KIRAN Mental Health Rehabilitation Helpline",
      number: "1800-599-0019",
      badge: "Govt. Helpline",
      desc: "24/7 national mental health helpline by Ministry of Social Justice."
    },
    {
      name: "Vandrevala Foundation Helpline",
      number: "+91 9999 666 555",
      badge: "Free Support",
      desc: "24/7 crisis counseling and mental wellness support in India."
    }
  ],
  international: [
    {
      name: "USA & Canada Suicide & Crisis Lifeline",
      number: "988",
      badge: "Call or Text 24/7",
      desc: "Free and confidential support for people in distress."
    },
    {
      name: "UK Emergency & Crisis (NHS / Samaritans)",
      number: "999 / 116 123",
      badge: "24/7 Support",
      desc: "Call 999 for emergencies or 116 123 for Samaritans free listening."
    },
    {
      name: "Global Helpline Directory",
      number: "https://findahelpline.com",
      badge: "Worldwide",
      desc: "Free, confidential crisis helplines in over 130 countries."
    }
  ]
};

function checkCrisisRisk(text) {
  if (!text || typeof text !== 'string') return { isCrisis: false };
  
  const matches = CRISIS_PATTERNS.some(regex => regex.test(text));
  if (matches) {
    return {
      isCrisis: true,
      severity: "critical",
      message: generateCrisisResponse(text),
      resources: EMERGENCY_RESOURCES
    };
  }
  
  return { isCrisis: false };
}

function generateCrisisResponse(userText) {
  const isHindiHinglish = /(mar|jaan|khatam|khudkushi|aatmhatya|zindagi|mujhe)/i.test(userText);

  if (isHindiHinglish) {
    return `Maine aapki baat suni hai aur main samajh sakta hoon ki aap is waqt bohot gehre dard aur takleef se guzar rahe hain. Lekin please dhyaan dein: aap akele nahi hain aur aapki jaan bohot keemti hai.

Main DARSHIL'S AI hoon — ek AI assistant — aur aisi sthiti mein human professional ki madad sabse zyada zaroori hai. Please abhi kisi bharosemand dost, family member ya niche diye gaye helpline par contact karein:

🚨 **Immediate Emergency (India):** Call **112**
📞 **Tele-MANAS (24/7 Free Helpline):** **14416** ya **1800-891-4416**
📞 **KIRAN Helpline:** **1800-599-0019**
📞 **Vandrevala Foundation:** **+91 9999 666 555**

Please ek gehra saans lijiye aur abhi kisi human support se baat kijiye. Log aapki madad ke liye taiyaar hain.`;
  }

  return `I hear how deeply overwhelmed and in pain you are feeling right now, and I want you to know that you are not alone in this dark moment. Your life and your well-being matter.

I am DARSHIL'S AI — an AI assistant — and I cannot provide the clinical crisis care you deserve right now. Please reach out immediately to a trusted friend, family member, or professional counselor who can support you right now.

🚨 **Immediate Emergency (India):** Call **112**
📞 **Tele-MANAS (Govt. of India 24/7):** Call **14416** or **1800-891-4416**
📞 **KIRAN Mental Health Helpline:** Call **1800-599-0019**
📞 **Vandrevala Foundation:** Call **+91 9999 666 555**
🌐 **USA/Canada Crisis Lifeline:** Call or text **988**
🌐 **Global Helplines:** Visit **https://findahelpline.com**

Please take one slow breath, step away from this screen, and speak with someone who can hold space for you. Help is available 24/7, confidential and free.`;
}

module.exports = {
  checkCrisisRisk,
  EMERGENCY_RESOURCES
};
