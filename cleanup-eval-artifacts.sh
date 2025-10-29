#!/usr/bin/env bash

# cleanup-eval-artifacts.sh
# Cleanup script for cc-eval temporary directories
#
# This script finds and removes temporary evaluation directories
# created by cc-eval in the OS temp directory.
#
# Usage:
#   ./cleanup-eval-artifacts.sh          # Interactive mode (asks for confirmation)
#   ./cleanup-eval-artifacts.sh -y       # Force mode (no confirmation)
#   ./cleanup-eval-artifacts.sh --dry-run # Dry-run mode (preview only)
#   ./cleanup-eval-artifacts.sh --help   # Show help

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
DRY_RUN=false
FORCE=false
VERBOSE=false

# Print colored message
print_color() {
    local color=$1
    shift
    echo -e "${color}$*${NC}"
}

# Show help message
show_help() {
    cat << EOF
cleanup-eval-artifacts.sh - Cleanup cc-eval temporary directories

USAGE:
    ./cleanup-eval-artifacts.sh [OPTIONS]

OPTIONS:
    -y, --yes       Skip confirmation prompt and delete immediately
    -n, --dry-run   Show what would be deleted without actually deleting
    -v, --verbose   Show verbose output
    -h, --help      Show this help message

DESCRIPTION:
    This script finds and removes temporary evaluation directories created by
    cc-eval. These directories follow the pattern "eval-{uuid}" and are located
    in the OS temporary directory.

    On macOS/Linux: /tmp or /var/folders/...

EXAMPLES:
    # Interactive mode (asks for confirmation)
    ./cleanup-eval-artifacts.sh

    # Skip confirmation
    ./cleanup-eval-artifacts.sh -y

    # Preview what would be deleted
    ./cleanup-eval-artifacts.sh --dry-run

    # Verbose output with confirmation
    ./cleanup-eval-artifacts.sh -v

EOF
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -y|--yes|--force)
            FORCE=true
            shift
            ;;
        -n|--dry-run)
            DRY_RUN=true
            shift
            ;;
        -v|--verbose)
            VERBOSE=true
            shift
            ;;
        -h|--help)
            show_help
            exit 0
            ;;
        *)
            print_color "$RED" "Error: Unknown option: $1"
            echo "Run with --help for usage information"
            exit 1
            ;;
    esac
done

# Detect OS temp directory (mimics Node.js os.tmpdir())
get_temp_dir() {
    if [[ -n "${TMPDIR:-}" ]]; then
        echo "$TMPDIR"
    elif [[ -d "/tmp" ]]; then
        echo "/tmp"
    else
        print_color "$RED" "Error: Cannot determine temp directory"
        exit 1
    fi
}


# Main cleanup logic
main() {
    TEMP_DIR=$(get_temp_dir)

    # Remove trailing slash if present
    TEMP_DIR="${TEMP_DIR%/}"

    print_color "$BLUE" "cc-eval Artifact Cleanup"
    print_color "$BLUE" "======================="
    echo ""
    print_color "$BLUE" "Temp directory: $TEMP_DIR"
    echo ""

    # Find all eval-* directories
    local eval_dirs=()
    if [[ -d "$TEMP_DIR" ]]; then
        while IFS= read -r -d '' dir; do
            eval_dirs+=("$dir")
        done < <(find "$TEMP_DIR" -maxdepth 1 -type d -name "eval-*" -print0 2>/dev/null)
    fi

    # Check if any directories found
    if [[ ${#eval_dirs[@]} -eq 0 ]]; then
        print_color "$GREEN" "✓ No eval artifacts found. Everything is clean!"
        exit 0
    fi

    # Display found directories
    print_color "$YELLOW" "Found ${#eval_dirs[@]} eval artifact(s):"
    echo ""

    for dir in "${eval_dirs[@]}"; do
        echo "  • ${dir##*/}"

        if [[ "$VERBOSE" == true ]]; then
            print_color "$BLUE" "    Path: $dir"
        fi
    done

    echo ""

    # Dry-run mode - just show what would be deleted
    if [[ "$DRY_RUN" == true ]]; then
        print_color "$YELLOW" "DRY RUN: Would delete ${#eval_dirs[@]} director(y/ies)"
        print_color "$BLUE" "Run without --dry-run to actually delete these directories"
        exit 0
    fi

    # Ask for confirmation unless force mode
    if [[ "$FORCE" != true ]]; then
        echo ""
        print_color "$YELLOW" "⚠️  This will permanently delete ${#eval_dirs[@]} director(y/ies)"
        read -p "Are you sure you want to continue? [y/N] " -n 1 -r
        echo ""
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            print_color "$BLUE" "Cleanup cancelled"
            exit 0
        fi
    fi

    # Delete directories
    echo ""
    print_color "$BLUE" "Cleaning up..."

    # Use rsync trick for faster deletion (especially with node_modules)
    empty_dir=$(mktemp -d)
    for dir in "${eval_dirs[@]}"; do
        rsync -a --delete "$empty_dir/" "$dir/" 2>/dev/null || true
        rmdir "$dir" 2>/dev/null || rm -rf "$dir"
        [[ "$VERBOSE" == true ]] && echo "  ✓ Deleted $(basename "$dir")"
    done
    rmdir "$empty_dir" 2>/dev/null || true

    # Count successful deletions by checking which directories no longer exist
    local deleted=0
    local failed=0
    for dir in "${eval_dirs[@]}"; do
        if [[ ! -e "$dir" ]]; then
            ((deleted++))
        else
            print_color "$RED" "  ✗ Failed to delete ${dir##*/}"
            ((failed++))
        fi
    done

    # Summary
    echo ""
    print_color "$BLUE" "======================="
    if [[ $failed -eq 0 ]]; then
        print_color "$GREEN" "✓ Successfully deleted $deleted director(y/ies)"
    else
        print_color "$YELLOW" "Deleted $deleted director(y/ies), $failed failed"
        if [[ $failed -gt 0 ]]; then
            print_color "$YELLOW" "Tip: Some directories may require sudo permissions"
        fi
    fi
}

# Run main function
main "$@"
