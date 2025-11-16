#!/bin/bash

# EAS Build Script for iOS
# Usage: ./eas-build.sh [production|development]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print usage
print_usage() {
    echo -e "${YELLOW}Usage:${NC} ./eas-build.sh [production|development]"
    echo ""
    echo "Arguments:"
    echo "  production   - Build production version and submit to TestFlight"
    echo "  development  - Build development version (no submission)"
    echo ""
    echo "Example:"
    echo "  ./eas-build.sh production"
    echo "  ./eas-build.sh development"
    exit 1
}

# Function to get timestamp
timestamp() {
    date '+%Y-%m-%d %H:%M:%S'
}

# Function to show progress while waiting
show_progress() {
    local pid=$1
    local message=$2
    local elapsed=0
    
    while kill -0 $pid 2>/dev/null; do
        sleep 60
        elapsed=$((elapsed + 1))
        echo -e "${BLUE}[$(timestamp)]${NC} Still working... (${elapsed} minute(s) elapsed) - ${message}"
    done
}

# Check if argument is provided
if [ $# -eq 0 ]; then
    echo -e "${RED}Error: No build type specified${NC}"
    echo ""
    print_usage
fi

BUILD_TYPE=$1

# Validate build type
if [ "$BUILD_TYPE" != "production" ] && [ "$BUILD_TYPE" != "development" ]; then
    echo -e "${RED}Error: Invalid build type '${BUILD_TYPE}'${NC}"
    echo ""
    print_usage
fi

# Determine script directory and project root
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
if [[ "$SCRIPT_DIR" == */scripts ]]; then
    # Running from scripts folder
    PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
else
    # Running from project root
    PROJECT_ROOT="$SCRIPT_DIR"
fi

# Change to project root
cd "$PROJECT_ROOT"

# Create logs directory if it doesn't exist
LOGS_DIR="$PROJECT_ROOT/scripts/logs"
mkdir -p "$LOGS_DIR"

# Setup log file
LOG_FILE="$LOGS_DIR/eas-build-${BUILD_TYPE}-$(date '+%Y%m%d-%H%M%S').log"

echo -e "${GREEN}===========================================================${NC}"
echo -e "${GREEN}EAS Build Script${NC}"
echo -e "${GREEN}===========================================================${NC}"
echo -e "Build Type: ${YELLOW}${BUILD_TYPE}${NC}"
echo -e "Project Root: ${BLUE}${PROJECT_ROOT}${NC}"
echo -e "Log File: ${BLUE}${LOG_FILE}${NC}"
echo -e "Start Time: ${BLUE}$(timestamp)${NC}"
echo -e "${GREEN}===========================================================${NC}"
echo ""

# Record start time
START_TIME=$(date +%s)

# Log function
log() {
    echo "[$(timestamp)] $1" | tee -a "$LOG_FILE"
}

log "Starting ${BUILD_TYPE} build process..."
log "Working directory: $(pwd)"

# Build command based on type
if [ "$BUILD_TYPE" == "production" ]; then
    log "Building production version..."
    echo -e "${YELLOW}Building production version (this may take several minutes)...${NC}"
    
    # Run build in background and capture PID
    eas build --profile production --platform ios --local --non-interactive >> "$LOG_FILE" 2>&1 &
    BUILD_PID=$!
    
    # Show progress
    show_progress $BUILD_PID "Building production IPA"
    
    # Wait for build to complete
    wait $BUILD_PID
    BUILD_EXIT_CODE=$?
    
    if [ $BUILD_EXIT_CODE -ne 0 ]; then
        log "ERROR: Build failed with exit code $BUILD_EXIT_CODE"
        echo -e "${RED}Build failed! Check log file: ${LOG_FILE}${NC}"
        exit $BUILD_EXIT_CODE
    fi
    
    log "Build completed successfully!"
    echo -e "${GREEN}✓ Build completed successfully!${NC}"
    
    # Find the IPA file (most recent .ipa in project root)
    # Use portable find command that works on both macOS and Linux
    # Ensure we're in the project root directory
    cd "$PROJECT_ROOT"
    
    # Find IPA files and get the most recent one (macOS/BSD compatible)
    # Try macOS/BSD stat first (stat -f)
    IPA_RELATIVE=$(find . -maxdepth 1 -name "*.ipa" -type f -exec stat -f "%m %N" {} \; 2>/dev/null | sort -rn | head -1 | cut -d' ' -f2-)
    
    # If stat -f doesn't work (Linux), try stat -c instead
    if [ -z "$IPA_RELATIVE" ]; then
        IPA_RELATIVE=$(find . -maxdepth 1 -name "*.ipa" -type f -exec stat -c "%Y %n" {} \; 2>/dev/null | sort -rn | head -1 | cut -d' ' -f2-)
    fi
    
    # Convert relative path to absolute path
    if [ -n "$IPA_RELATIVE" ]; then
        # Remove leading ./ if present
        IPA_RELATIVE="${IPA_RELATIVE#./}"
        IPA_PATH="$PROJECT_ROOT/$IPA_RELATIVE"
    else
        IPA_PATH=""
    fi
    
    if [ -z "$IPA_PATH" ] || [ ! -f "$IPA_PATH" ]; then
        log "ERROR: Could not find IPA file in $PROJECT_ROOT"
        echo -e "${RED}Could not find IPA file in project root: $PROJECT_ROOT${NC}"
        echo -e "${YELLOW}Searching for IPA files...${NC}"
        find "$PROJECT_ROOT" -name "*.ipa" -type f 2>/dev/null | head -5
        exit 1
    fi
    
    log "Found IPA: $IPA_PATH"
    echo -e "${BLUE}Found IPA: $(basename "$IPA_PATH")${NC}"
    echo ""
    
    # Submit to TestFlight
    log "Submitting to TestFlight..."
    echo -e "${YELLOW}Submitting to TestFlight...${NC}"
    
    eas submit -p ios --path "$IPA_PATH" --non-interactive >> "$LOG_FILE" 2>&1 &
    SUBMIT_PID=$!
    
    # Show progress
    show_progress $SUBMIT_PID "Submitting to TestFlight"
    
    # Wait for submission to complete
    wait $SUBMIT_PID
    SUBMIT_EXIT_CODE=$?
    
    if [ $SUBMIT_EXIT_CODE -ne 0 ]; then
        log "ERROR: Submission failed with exit code $SUBMIT_EXIT_CODE"
        echo -e "${RED}Submission failed! Check log file: ${LOG_FILE}${NC}"
        exit $SUBMIT_EXIT_CODE
    fi
    
    log "Submission completed successfully!"
    echo -e "${GREEN}✓ Submission completed successfully!${NC}"
    
else
    log "Building development version..."
    echo -e "${YELLOW}Building development version (this may take several minutes)...${NC}"
    
    # Run build in background and capture PID
    eas build --profile development --platform ios --local --non-interactive >> "$LOG_FILE" 2>&1 &
    BUILD_PID=$!
    
    # Show progress
    show_progress $BUILD_PID "Building development IPA"
    
    # Wait for build to complete
    wait $BUILD_PID
    BUILD_EXIT_CODE=$?
    
    if [ $BUILD_EXIT_CODE -ne 0 ]; then
        log "ERROR: Build failed with exit code $BUILD_EXIT_CODE"
        echo -e "${RED}Build failed! Check log file: ${LOG_FILE}${NC}"
        exit $BUILD_EXIT_CODE
    fi
    
    log "Build completed successfully!"
    echo -e "${GREEN}✓ Build completed successfully!${NC}"
fi

# Calculate total time
END_TIME=$(date +%s)
TOTAL_TIME=$((END_TIME - START_TIME))
MINUTES=$((TOTAL_TIME / 60))
SECONDS=$((TOTAL_TIME % 60))

log "Total build time: ${MINUTES}m ${SECONDS}s"

echo ""
echo -e "${GREEN}===========================================================${NC}"
echo -e "${GREEN}Build Complete!${NC}"
echo -e "${GREEN}===========================================================${NC}"
echo -e "Total Time: ${YELLOW}${MINUTES}m ${SECONDS}s${NC}"
echo -e "End Time: ${BLUE}$(timestamp)${NC}"
echo -e "Log File: ${BLUE}${LOG_FILE}${NC}"
echo -e "${GREEN}===========================================================${NC}"

exit 0
