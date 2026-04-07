# Inventory Verification Setup Guide

## Overview
This guide explains how to configure the Sigma workbook to trigger the native inventory verification modal in the mobile app.

## Implementation Complete ✅

### Mobile App Components
- ✅ `types/inventory.types.ts` - TypeScript interfaces
- ✅ `components/InventoryVerificationModal.tsx` - Native modal component
- ✅ `app/(tabs)/Operations.tsx` - Integrated with Operations screen
- ✅ `components/DashboardView.tsx` - Event listener added

## Sigma Workbook Configuration

### Step 1: Configure the Verify Inventory Button Action

In your Sigma workbook ([Data-App-v1-Mobile](https://app.sigmacomputing.com/papercrane-embedding-gcp/workbook/Data-App-v1-Mobile-285cUkL2a6T21lfRQk4brT)):

1. **Select the "Verify Inventory" button** (or the element that should trigger verification)

2. **Open Actions panel** → Create new action or edit existing

3. **Action Type**: Select **"Generate iframe event"**

4. **Configure Event Details**:

   **Event Name**: `inventory:verify`

   **Event Keys and Values** (add these key-value pairs):
   
   | Key | Value | Example |
   |-----|-------|---------|
   | `sku` | Reference to SKU column | `[SKU]` or `[Product SKU]` |
   | `productName` | Reference to product name column | `[Product Name]` |
   | `systemQty` | Reference to system quantity column | `[System Quantity]` or `[Available Inventory]` |
   | `requestedQty` | (Optional) Requested transfer quantity | `[Requested Qty]` |
   | `fromStore` | (Optional) Source store name | `[From Store]` |
   | `toStore` | (Optional) Destination store name | `[To Store]` |

5. **Save the action**

### Step 2: Set Up Response Variables (Optional)

If you want to receive the verification data back from the mobile app, create these workbook variables:

- `p_physical_count` - Will receive the physical count entered by user
- `p_transfer_qty` - Will receive the calculated transfer quantity
- `p_verification_notes` - Will receive any notes entered
- `p_verification_complete` - Boolean flag set to true when confirmed

These variables will be updated via `workbook:variables:update` postMessage when the user confirms the verification.

### Step 3: Test the Integration

1. **Open the app** on your device
2. **Navigate to Operations** tile from home page
3. **Find a product** with a "Verify Inventory" button
4. **Click the button** → Native modal should appear
5. **Verify the data**:
   - Product name and SKU display correctly
   - System quantity shows the right value
   - Optional fields (stores, requested qty) if configured
6. **Enter physical count** → Available transfer qty auto-calculates
7. **Add notes** (optional)
8. **Tap Confirm** → Data sends back to Sigma, modal closes

## Event Structure

### Outbound Event from Sigma (inventory:verify)

```json
{
  "type": "inventory:verify",
  "sku": "AU-SO-0000000608",
  "productName": "Sony WH-1000XM5",
  "systemQty": 120,
  "requestedQty": 50,
  "fromStore": "Pacoima #100019",
  "toStore": "LA Flagship #100010"
}
```

### Inbound Event to Sigma (workbook:variables:update)

```json
{
  "type": "workbook:variables:update",
  "variables": {
    "p_physical_count": 118,
    "p_transfer_qty": 50,
    "p_verification_notes": "Items in warehouse section B",
    "p_verification_complete": true
  }
}
```

## Modal Features

### User Experience
1. **Tap "Verify Inventory"** → Modal slides up from bottom
2. **View product details** → SKU, name, system count displayed
3. **Enter physical count** → Numeric keyboard appears
4. **Auto-calculated transfer** → Updates based on physical count and requested qty
5. **Add optional notes** → Multiline text input
6. **Confirm or Cancel** → Submit or close modal

### Validation
- Physical count must be a valid number ≥ 0
- Confirm button disabled until valid count entered
- Transfer quantity auto-calculates: `min(physicalCount, requestedQty || physicalCount)`

### Visual Design
- Full-screen modal with slide-up animation
- Header spacing: 48px top padding (same as ChatModal)
- Clear labels and hints
- Primary button for Confirm (orange)
- Secondary button for Cancel (gray)
- Responsive to keyboard

## Troubleshooting

### Modal doesn't open when clicking button
- Check browser/app console for event logs: "📦 Inventory verification requested"
- Verify event name is exactly `inventory:verify` (case-sensitive)
- Check that event data includes required fields (sku, productName, systemQty)

### Data not displaying correctly
- Verify column references in Sigma action configuration
- Check that field names match exactly (sku, productName, systemQty)
- Look for console logs showing parsed data

### Confirmation not updating Sigma
- Verify workbook variables are created in Sigma
- Check console for "📦 INVENTORY CONFIRMED" logs
- Ensure variable names match (p_physical_count, p_transfer_qty, etc.)

## Technical Details

### Event Flow
1. User clicks button in Sigma → Action triggers
2. Sigma sends postMessage with `type: 'inventory:verify'`
3. DashboardView receives message → Calls inventoryVerificationCallbackRef
4. Operations screen receives callback → Updates state, opens modal
5. User fills form → Taps Confirm
6. Modal calls onConfirm → Sends data back to Sigma via postMessage
7. Modal closes → Form resets

### Code References
- Event handling: `components/DashboardView.tsx` (lines ~402-407)
- Modal component: `components/InventoryVerificationModal.tsx`
- Integration: `app/(tabs)/Operations.tsx` (handleInventoryVerification)

## Success Criteria
✅ Native modal opens when action triggered  
✅ Product info displays correctly  
✅ Physical count input works  
✅ Transfer quantity auto-calculates  
✅ Notes field accepts text  
✅ Confirm sends data back to Sigma  
✅ Modal animation smooth  
✅ Form resets on close  

## Next Steps
- Configure the action in your Sigma workbook
- Test the flow end-to-end
- Optionally add success toast notification after confirmation
- Consider adding form validation messages

