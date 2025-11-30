#!/bin/bash

# EAS Build Script for iOS
# Usage: ./eas-build.sh [production|development|deploy <ipa-path>]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print usage
print_usage() {
    echo -e "${YELLOW}Usage:${NC} ./eas-build.sh [production|development|deploy <ipa-path>]"
    echo ""
    echo "Arguments:"
    echo "  production          - Build production version and submit to TestFlight"
    echo "  development         - Build development version (no submission)"
    echo "  deploy <ipa-path>   - Submit existing IPA file to TestFlight"
    echo ""
    echo "Examples:"
    echo "  ./eas-build.sh production"
    echo "  ./eas-build.sh development"
    echo "  ./eas-build.sh deploy ./build-1234567890.ipa"
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

# Function to find IPA file
find_ipa_file() {
    local project_root=$1
    local log_file=$2
    local ipa_path=""
    
    # First, try to parse from build log output
    if [ -f "$log_file" ]; then
        # Look for "You can find the build artifacts in" pattern
        ipa_path=$(grep -i "You can find the build artifacts in" "$log_file" | tail -1 | sed -E 's/.*You can find the build artifacts in[[:space:]]+([^[:space:]]+).*/\1/' | xargs)
        
        # Also try "Writing artifacts to" pattern
        if [ -z "$ipa_path" ]; then
            ipa_path=$(grep -i "Writing artifacts to" "$log_file" | tail -1 | sed -E 's/.*Writing artifacts to[[:space:]]+([^[:space:]]+).*/\1/' | xargs)
        fi
        
        # Verify the parsed path exists
        if [ -n "$ipa_path" ] && [ -f "$ipa_path" ]; then
            echo "$ipa_path"
            return 0
        fi
    fi
    
    # Fallback: find most recent IPA in project root
    cd "$project_root"
    
    # Find IPA files and get the most recent one (macOS/BSD compatible)
    # Try macOS/BSD stat first (stat -f)
    local ipa_relative=$(find . -maxdepth 1 -name "*.ipa" -type f -exec stat -f "%m %N" {} \; 2>/dev/null | sort -rn | head -1 | cut -d' ' -f2-)
    
    # If stat -f doesn't work (Linux), try stat -c instead
    if [ -z "$ipa_relative" ]; then
        ipa_relative=$(find . -maxdepth 1 -name "*.ipa" -type f -exec stat -c "%Y %n" {} \; 2>/dev/null | sort -rn | head -1 | cut -d' ' -f2-)
    fi
    
    # Convert relative path to absolute path
    if [ -n "$ipa_relative" ]; then
        # Remove leading ./ if present
        ipa_relative="${ipa_relative#./}"
        ipa_path="$project_root/$ipa_relative"
    fi
    
    if [ -n "$ipa_path" ] && [ -f "$ipa_path" ]; then
        echo "$ipa_path"
        return 0
    fi
    
    return 1
}

# Function to rename IPA file to include build type
rename_ipa_with_build_type() {
    local ipa_path=$1
    local build_type=$2
    local project_root=$3
    
    if [ -z "$ipa_path" ] || [ ! -f "$ipa_path" ]; then
        return 1
    fi
    
    local ipa_dir=$(dirname "$ipa_path")
    local ipa_filename=$(basename "$ipa_path")
    local ipa_name="${ipa_filename%.ipa}"
    local ipa_ext=".ipa"
    
    # Create new filename with build type
    # If filename already contains build type, don't rename again
    if [[ "$ipa_name" == *"-${build_type}" ]]; then
        return 0
    fi
    
    # Insert build type before the extension
    local new_ipa_name="${ipa_name}-${build_type}${ipa_ext}"
    local new_ipa_path="$ipa_dir/$new_ipa_name"
    
    # Rename the file
    if mv "$ipa_path" "$new_ipa_path" 2>/dev/null; then
        echo "$new_ipa_path"
        return 0
    else
        # If rename fails, return original path
        echo "$ipa_path"
        return 1
    fi
}

# Function to submit IPA to TestFlight
submit_ipa() {
    local ipa_path=$1
    local log_file=$2
    
    log "Submitting to TestFlight..."
    echo -e "${YELLOW}Submitting to TestFlight...${NC}"
    
    # Run submit command and capture output
    local submit_output=$(mktemp)
    eas submit -p ios --path "$ipa_path" --non-interactive >> "$log_file" 2>&1
    local submit_exit_code=$?
    
    # Check for errors in the output
    local has_error=false
    if grep -qi "submission failed\|error\|failed" "$log_file"; then
        has_error=true
    fi
    
    # Check exit code or error messages
    if [ $submit_exit_code -ne 0 ] || [ "$has_error" = true ]; then
        log "ERROR: Submission failed"
        echo -e "${RED}Submission failed!${NC}"
        echo -e "${YELLOW}Last few lines of submission output:${NC}"
        tail -20 "$log_file" | grep -A 20 -i "error\|failed\|submission" || tail -10 "$log_file"
        echo ""
        echo -e "${RED}Check log file for details: ${log_file}${NC}"
        return 1
    fi
    
    log "Submission completed successfully!"
    echo -e "${GREEN}✓ Submission completed successfully!${NC}"
    return 0
}

# Check if argument is provided
if [ $# -eq 0 ]; then
    echo -e "${RED}Error: No build type specified${NC}"
    echo ""
    print_usage
fi

BUILD_TYPE=$1

# Handle deploy mode
if [ "$BUILD_TYPE" == "deploy" ]; then
    if [ $# -lt 2 ]; then
        echo -e "${RED}Error: deploy mode requires IPA file path${NC}"
        echo ""
        print_usage
    fi
    
    IPA_PATH="$2"
    
    # Convert to absolute path if relative
    if [[ ! "$IPA_PATH" = /* ]]; then
        IPA_PATH="$(cd "$(dirname "$IPA_PATH")" && pwd)/$(basename "$IPA_PATH")"
    fi
    
    if [ ! -f "$IPA_PATH" ]; then
        echo -e "${RED}Error: IPA file not found: $IPA_PATH${NC}"
        exit 1
    fi
    
    # Determine script directory and project root
    SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
    if [[ "$SCRIPT_DIR" == */scripts ]]; then
        PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
    else
        PROJECT_ROOT="$SCRIPT_DIR"
    fi
    
    cd "$PROJECT_ROOT"
    
    # Create logs directory if it doesn't exist
    LOGS_DIR="$PROJECT_ROOT/scripts/logs"
    mkdir -p "$LOGS_DIR"
    
    # Setup log file
    LOG_FILE="$LOGS_DIR/eas-deploy-$(date '+%Y%m%d-%H%M%S').log"
    
    echo -e "${GREEN}===========================================================${NC}"
    echo -e "${GREEN}EAS Deploy Script${NC}"
    echo -e "${GREEN}===========================================================${NC}"
    echo -e "IPA File: ${BLUE}$IPA_PATH${NC}"
    echo -e "Log File: ${BLUE}${LOG_FILE}${NC}"
    echo -e "Start Time: ${BLUE}$(timestamp)${NC}"
    echo -e "${GREEN}===========================================================${NC}"
    echo ""
    
    START_TIME=$(date +%s)
    
    # Log function
    log() {
        echo "[$(timestamp)] $1" | tee -a "$LOG_FILE"
    }
    
    log "Starting deploy process..."
    log "IPA file: $IPA_PATH"
    
    # Submit the IPA
    if ! submit_ipa "$IPA_PATH" "$LOG_FILE"; then
        exit 1
    fi
    
    # Calculate total time
    END_TIME=$(date +%s)
    TOTAL_TIME=$((END_TIME - START_TIME))
    MINUTES=$((TOTAL_TIME / 60))
    SECONDS=$((TOTAL_TIME % 60))
    
    log "Total deploy time: ${MINUTES}m ${SECONDS}s"
    
    echo ""
    echo -e "${GREEN}===========================================================${NC}"
    echo -e "${GREEN}Deploy Complete!${NC}"
    echo -e "${GREEN}===========================================================${NC}"
    echo -e "Total Time: ${YELLOW}${MINUTES}m ${SECONDS}s${NC}"
    echo -e "End Time: ${BLUE}$(timestamp)${NC}"
    echo -e "Log File: ${BLUE}${LOG_FILE}${NC}"
    echo -e "${GREEN}===========================================================${NC}"
    
    exit 0
fi

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
    
    # Find the IPA file
    IPA_PATH=$(find_ipa_file "$PROJECT_ROOT" "$LOG_FILE")
    
    if [ -z "$IPA_PATH" ] || [ ! -f "$IPA_PATH" ]; then
        log "ERROR: Could not find IPA file"
        echo -e "${RED}Could not find IPA file in project root: $PROJECT_ROOT${NC}"
        echo -e "${YELLOW}Searching for IPA files...${NC}"
        find "$PROJECT_ROOT" -name "*.ipa" -type f 2>/dev/null | head -5
        exit 1
    fi
    
    log "Found IPA: $IPA_PATH"
    echo -e "${BLUE}Found IPA: $(basename "$IPA_PATH")${NC}"
    
    # Rename IPA to include build type
    RENAMED_IPA_PATH=$(rename_ipa_with_build_type "$IPA_PATH" "$BUILD_TYPE" "$PROJECT_ROOT")
    if [ "$RENAMED_IPA_PATH" != "$IPA_PATH" ]; then
        IPA_PATH="$RENAMED_IPA_PATH"
        log "Renamed IPA to: $IPA_PATH"
        echo -e "${BLUE}Renamed to: $(basename "$IPA_PATH")${NC}"
    fi
    echo ""
    
    # Submit to TestFlight
    if ! submit_ipa "$IPA_PATH" "$LOG_FILE"; then
        exit 1
    fi
    
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
    
    # Find the IPA file
    IPA_PATH=$(find_ipa_file "$PROJECT_ROOT" "$LOG_FILE")
    
    if [ -z "$IPA_PATH" ] || [ ! -f "$IPA_PATH" ]; then
        log "ERROR: Could not find IPA file"
        echo -e "${RED}Could not find IPA file in project root: $PROJECT_ROOT${NC}"
        echo -e "${YELLOW}Searching for IPA files...${NC}"
        find "$PROJECT_ROOT" -name "*.ipa" -type f 2>/dev/null | head -5
        exit 1
    fi
    
    log "Found IPA: $IPA_PATH"
    echo -e "${BLUE}Found IPA: $(basename "$IPA_PATH")${NC}"
    
    # Rename IPA to include build type
    RENAMED_IPA_PATH=$(rename_ipa_with_build_type "$IPA_PATH" "$BUILD_TYPE" "$PROJECT_ROOT")
    if [ "$RENAMED_IPA_PATH" != "$IPA_PATH" ]; then
        IPA_PATH="$RENAMED_IPA_PATH"
        log "Renamed IPA to: $IPA_PATH"
        echo -e "${BLUE}Renamed to: $(basename "$IPA_PATH")${NC}"
    fi
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
