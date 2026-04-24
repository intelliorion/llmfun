"""
Orion — Configuration

Tunables for the knowledge graph pipeline. Safe to edit without code changes.
"""

# LLM Settings
LLM_ID = "openai:gpt-4o"  # Override via ORION_DEFAULT_MODEL env var

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
