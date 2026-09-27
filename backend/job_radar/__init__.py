"""Job Radar — scans company career pages daily and records postings that match your criteria."""

import warnings

# macOS' system Python links LibreSSL; urllib3 v2 warns about it on import. Harmless for our use.
warnings.filterwarnings("ignore", message="urllib3 v2 only supports OpenSSL")

__version__ = "1.0.0"
