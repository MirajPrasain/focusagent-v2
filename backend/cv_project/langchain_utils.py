import google.generativeai as genai
import os

# Configure the Gemini API
genai.configure(api_key=os.getenv("GOOGLE_API_KEY"))

# Initialize the model
model = genai.GenerativeModel(
    model_name="gemini-1.5-flash",
    generation_config={
        "temperature": 0.7,
        "max_output_tokens": 1024,
        "top_p": 0.8,
        "top_k": 40,
    }
)

def generate_focus_message(duration, vibe, minute, cheat_count):
    """
    Generate a motivational message to keep the user focused during their study session.
    
    Args:
        duration (int): Total session duration in minutes
        vibe (str): The tone/vibe for the message (calm, beast, game)
        minute (int): Current minute of the session
        cheat_count (int): Number of distraction events detected
    
    Returns:
        str: Generated motivational message
    """
    prompt = f"""
You're a motivational AI assistant helping a human stay focused during a deep work session.

Their current session:
- Duration: {duration} minutes
- Vibe: {vibe}
- Minutes passed: {minute}
- Cheat Events: {cheat_count}

Give a short, powerful message to keep them focused. Use a tone matching the vibe. Be concise and human.

Vibe guidelines:
- "calm": Gentle, soothing, zen-like encouragement
- "beast": High-energy, intense, aggressive motivation
- "game": Playful, gaming-inspired, achievement-focused

Keep the message under 50 words.
"""
    
    try:
        response = model.generate_content(prompt)
        return response.text.strip()
    except Exception as e:
        # Fallback messages if API fails
        fallback_messages = {
            "calm": "Take a deep breath. You're doing great. Stay present and focused.",
            "beast": "PUSH THROUGH! You're stronger than any distraction. DOMINATE this session!",
            "game": "Level up your focus! You've got this quest in the bag. Keep grinding!"
        }
        return fallback_messages.get(vibe, "Stay focused. You've got this!")