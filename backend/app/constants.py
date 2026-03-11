"""
App-wide defaults. Voice agent uses Deepgram STT, Groq/Modal LLM, Cartesia TTS.
"""

# ElevenLabs default voice ID (Rachel). Used by /voices and any remaining ElevenLabs usage.
DEFAULT_ELEVENLABS_VOICE_ID = "bIHbv24MWmeRgasZH58o"

# Cartesia default voice ID. Used when agent has no tts_voice_id (voice agent stack).
DEFAULT_CARTESIA_VOICE_ID = "a0e99841-438c-4a64-b679-ae501e7d6091"

# Supported languages for STT (Deepgram nova-2) and TTS (Cartesia Sonic-3). Same codes for both.
# Format: (code, display name) for agent language selector (e.g. Arabic, English).
SUPPORTED_LANGUAGES = [
    ("en", "English"), ("ar", "Arabic"), ("bn", "Bengali"), ("bg", "Bulgarian"), ("zh", "Chinese"),
    ("hr", "Croatian"), ("cs", "Czech"), ("da", "Danish"), ("nl", "Dutch"), ("fi", "Finnish"),
    ("fr", "French"), ("ka", "Georgian"), ("de", "German"), ("el", "Greek"), ("gu", "Gujarati"),
    ("he", "Hebrew"), ("hi", "Hindi"), ("hu", "Hungarian"), ("id", "Indonesian"), ("it", "Italian"),
    ("ja", "Japanese"), ("kn", "Kannada"), ("ko", "Korean"), ("ml", "Malayalam"), ("ms", "Malay"),
    ("mr", "Marathi"), ("no", "Norwegian"), ("pa", "Punjabi"), ("pl", "Polish"), ("pt", "Portuguese"),
    ("ro", "Romanian"), ("ru", "Russian"), ("sk", "Slovak"), ("es", "Spanish"), ("sv", "Swedish"),
    ("tl", "Tagalog"), ("ta", "Tamil"), ("te", "Telugu"), ("th", "Thai"), ("tr", "Turkish"),
    ("uk", "Ukrainian"), ("vi", "Vietnamese"),
]
