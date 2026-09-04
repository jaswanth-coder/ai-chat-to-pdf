#!/usr/bin/env bash
set -e

# Package AI Chat to PDF Chrome Extension into zip file
OUTPUT="ai-chat-to-pdf.zip"

echo "Packaging extension into ${OUTPUT}..."
rm -f "${OUTPUT}"

zip -r "${OUTPUT}" manifest.json icons popup src -x "*.DS_Store" "*__MACOSX*"

echo "Successfully created ${OUTPUT} ($(du -h "${OUTPUT}" | cut -f1))"
