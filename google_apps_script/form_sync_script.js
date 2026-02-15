// ============================================================
// Music City by Night — Form Sync Script (v2)
// ============================================================
// SETUP: Paste this into Extensions → Apps Script in your
// Google Sheet. Update the two form IDs below.
//
// To find a form ID: open the form editor, look at the URL:
// https://docs.google.com/forms/d/FORM_ID_IS_HERE/edit
//
// SHEET TABS REQUIRED:
//   - Roster (col A = name, col F = active)
//   - Play Periods (col A = label, col G = active)
//   - XP Responses (form responses land here)
//   - Spend Requests (form responses land here)
// ============================================================

const XP_FORM_ID = 'PASTE_YOUR_XP_FORM_ID_HERE';
const SPEND_FORM_ID = 'PASTE_YOUR_SPEND_FORM_ID_HERE';

// Form question positions (0-indexed).
// Character Name = first question, Play Period = second question.
const CHAR_NAME_INDEX = 0;
const PLAY_PERIOD_INDEX = 1;

// XP Responses column indices (1-indexed for getRange)
// Matches headers: timestamp(A), character_name(B), play_period(C),
// ...categories..., xp_claimed(P), status(Q), approved_xp(R),
// reviewed_by(S), review_date(T), st_notes(U)
const XP_STATUS_COL = 17;   // Column Q: status
const XP_NOTES_COL = 21;    // Column U: st_notes

// ============================================================
// MAIN SYNC FUNCTION
// ============================================================

function syncFormsWithSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // --- Get active character names from Roster ---
  const rosterSheet = ss.getSheetByName('Roster');
  if (!rosterSheet) {
    Logger.log('ERROR: No sheet named "Roster" found.');
    return;
  }

  const rosterData = rosterSheet.getDataRange().getValues();
  const activeCharacters = [];

  for (let i = 1; i < rosterData.length; i++) {
    const charName = rosterData[i][0]; // Column A: character_name
    const isActive = rosterData[i][5]; // Column F: active

    if (charName && (isActive === true || isActive === 'TRUE')) {
      activeCharacters.push(charName.toString().trim());
    }
  }

  activeCharacters.sort();
  Logger.log('Active characters found: ' + activeCharacters.length);

  // --- Get active play periods ---
  const periodsSheet = ss.getSheetByName('Play Periods');
  if (!periodsSheet) {
    Logger.log('ERROR: No sheet named "Play Periods" found.');
    return;
  }

  const periodsData = periodsSheet.getDataRange().getValues();
  const activePeriods = [];

  for (let i = 1; i < periodsData.length; i++) {
    const periodLabel = periodsData[i][0]; // Column A: period_label
    const isActive = periodsData[i][6];    // Column G: active

    if (periodLabel && (isActive === true || isActive === 'TRUE')) {
      activePeriods.push(periodLabel.toString().trim());
    }
  }

  Logger.log('Active periods found: ' + activePeriods.length);

  // --- Update both forms ---
  if (XP_FORM_ID !== 'PASTE_YOUR_XP_FORM_ID_HERE') {
    updateFormDropdowns(XP_FORM_ID, activeCharacters, activePeriods);
    Logger.log('XP Form updated.');
  } else {
    Logger.log('SKIPPED: XP Form ID not configured.');
  }

  if (SPEND_FORM_ID !== 'PASTE_YOUR_SPEND_FORM_ID_HERE') {
    // Spend form only needs character names (no period dropdown)
    updateFormDropdowns(SPEND_FORM_ID, activeCharacters, null);
    Logger.log('Spend Form updated.');
  } else {
    Logger.log('SKIPPED: Spend Form ID not configured.');
  }

  Logger.log('Sync complete!');
}

// ============================================================
// FORM DROPDOWN UPDATER
// ============================================================

function updateFormDropdowns(formId, characters, periods) {
  const form = FormApp.openById(formId);
  const items = form.getItems();

  // Update Character Name dropdown
  if (items.length > CHAR_NAME_INDEX) {
    const charItem = items[CHAR_NAME_INDEX];
    if (charItem.getType() === FormApp.ItemType.LIST) {
      const charDropdown = charItem.asListItem();
      if (characters.length > 0) {
        charDropdown.setChoiceValues(characters);
      }
    } else {
      Logger.log('WARNING: Question at index ' + CHAR_NAME_INDEX +
                 ' is not a dropdown (LIST) type.');
    }
  }

  // Update Play Period dropdown (if provided)
  if (periods && items.length > PLAY_PERIOD_INDEX) {
    const periodItem = items[PLAY_PERIOD_INDEX];
    if (periodItem.getType() === FormApp.ItemType.LIST) {
      const periodDropdown = periodItem.asListItem();
      if (periods.length > 0) {
        periodDropdown.setChoiceValues(periods);
      }
    } else {
      Logger.log('WARNING: Question at index ' + PLAY_PERIOD_INDEX +
                 ' is not a dropdown (LIST) type.');
    }
  }
}

// ============================================================
// DUPLICATE SUBMISSION CHECKER
// Runs on XP form submission. Flags duplicates (same character +
// same period) with "DUPLICATE" status.
// ============================================================

function onXPFormSubmit(e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('XP Responses');
  if (!sheet) return;

  const data = sheet.getDataRange().getValues();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  // Column B = character_name (index 1), Column C = play_period (index 2)
  const newCharacter = data[lastRow - 1][1];
  const newPeriod = data[lastRow - 1][2];

  let isDuplicate = false;
  for (let i = 1; i < lastRow - 1; i++) {
    if (data[i][1] === newCharacter && data[i][2] === newPeriod) {
      isDuplicate = true;
      break;
    }
  }

  if (isDuplicate) {
    sheet.getRange(lastRow, XP_STATUS_COL).setValue('DUPLICATE');
    sheet.getRange(lastRow, XP_NOTES_COL).setValue(
      'Auto-flagged: duplicate submission for ' +
      newCharacter + ' / ' + newPeriod
    );
    Logger.log('DUPLICATE flagged: ' + newCharacter + ' / ' + newPeriod);
  } else {
    // Set initial status to "Pending" for new submissions
    sheet.getRange(lastRow, XP_STATUS_COL).setValue('Pending');
  }

  // Auto-calculate xp_claimed (count of TRUE checkboxes in columns D-O)
  // Columns D,F,H,J,L,N are the checkbox columns (indices 3,5,7,9,11,13)
  const checkboxIndices = [3, 5, 7, 9, 11, 13];
  let xpCount = 0;
  for (const idx of checkboxIndices) {
    const val = data[lastRow - 1][idx];
    if (val === true || val === 'TRUE' || val === 'Yes') {
      xpCount++;
    }
  }
  // Column P = xp_claimed (column 16)
  sheet.getRange(lastRow, 16).setValue(xpCount);
}

// ============================================================
// SPEND FORM — Set "Pending" status on new submissions
// ============================================================

function onSpendFormSubmit(e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Spend Requests');
  if (!sheet) return;

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  // Column J = status (column 10)
  sheet.getRange(lastRow, 10).setValue('Pending');
}

// ============================================================
// TRIGGER SETUP — Run ONCE to create automatic daily sync
// ============================================================

function createDailyTrigger() {
  // Remove existing triggers for this function
  const triggers = ScriptApp.getProjectTriggers();
  for (const trigger of triggers) {
    if (trigger.getHandlerFunction() === 'syncFormsWithSheet') {
      ScriptApp.deleteTrigger(trigger);
    }
  }

  // Create daily trigger at 6 AM
  ScriptApp.newTrigger('syncFormsWithSheet')
    .timeBased()
    .everyDays(1)
    .atHour(6)
    .create();

  Logger.log('Daily sync trigger created (runs at ~6 AM).');
}

// ============================================================
// TRIGGER SETUP — Duplicate checker on XP form submit
// Run ONCE to set up the on-submit trigger
// ============================================================

function createXPFormSubmitTrigger() {
  const triggers = ScriptApp.getProjectTriggers();
  for (const trigger of triggers) {
    if (trigger.getHandlerFunction() === 'onXPFormSubmit') {
      ScriptApp.deleteTrigger(trigger);
    }
  }

  ScriptApp.newTrigger('onXPFormSubmit')
    .forSpreadsheet(SpreadsheetApp.getActiveSpreadsheet())
    .onFormSubmit()
    .create();

  Logger.log('XP form submit trigger created.');
}

// ============================================================
// TRIGGER SETUP — Spend form status setter
// Run ONCE to set up the on-submit trigger
// ============================================================

function createSpendFormSubmitTrigger() {
  const triggers = ScriptApp.getProjectTriggers();
  for (const trigger of triggers) {
    if (trigger.getHandlerFunction() === 'onSpendFormSubmit') {
      ScriptApp.deleteTrigger(trigger);
    }
  }

  ScriptApp.newTrigger('onSpendFormSubmit')
    .forSpreadsheet(SpreadsheetApp.getActiveSpreadsheet())
    .onFormSubmit()
    .create();

  Logger.log('Spend form submit trigger created.');
}

// ============================================================
// UTILITY: Dry run — see what the sync would do without
// touching the forms. Check the execution log for output.
// ============================================================

function dryRun() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const rosterSheet = ss.getSheetByName('Roster');
  const rosterData = rosterSheet.getDataRange().getValues();
  const activeCharacters = [];

  for (let i = 1; i < rosterData.length; i++) {
    const charName = rosterData[i][0];
    const isActive = rosterData[i][5];
    if (charName && (isActive === true || isActive === 'TRUE')) {
      activeCharacters.push(charName.toString().trim());
    }
  }

  const periodsSheet = ss.getSheetByName('Play Periods');
  const periodsData = periodsSheet.getDataRange().getValues();
  const activePeriods = [];

  for (let i = 1; i < periodsData.length; i++) {
    const periodLabel = periodsData[i][0];
    const isActive = periodsData[i][6];
    if (periodLabel && (isActive === true || isActive === 'TRUE')) {
      activePeriods.push(periodLabel.toString().trim());
    }
  }

  Logger.log('========== DRY RUN ==========');
  Logger.log('Active Characters (' + activeCharacters.length + '):');
  Logger.log(activeCharacters.join(', '));
  Logger.log('');
  Logger.log('Active Periods (' + activePeriods.length + '):');
  Logger.log(activePeriods.join(', '));
  Logger.log('=============================');
}

// ============================================================
// SETUP ALL TRIGGERS — Run this once after configuring form IDs
// ============================================================

function setupAllTriggers() {
  createDailyTrigger();
  createXPFormSubmitTrigger();
  createSpendFormSubmitTrigger();
  Logger.log('All triggers configured.');
}
