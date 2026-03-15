"""
MiroFish MS POC - Configuration
Dataiku-compatible settings for Morgan Stanley environment.
"""

# LLM Settings (Dataiku LLM Mesh)
LLM_ID = "openai:gpt-4o"  # Update to match your Dataiku LLM connection ID

# Graph Settings
MAX_ENTITY_TYPES = 10
MAX_EDGE_TYPES = 10
TEXT_CHUNK_SIZE = 500
TEXT_CHUNK_OVERLAP = 50

# Extraction Settings
MAX_ENTITIES_PER_CHUNK = 10
MAX_RETRIES = 3

# Report Settings
MAX_REPORT_SECTIONS = 5
MAX_REACT_ITERATIONS = 5
