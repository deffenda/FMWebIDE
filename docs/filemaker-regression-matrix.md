# FileMaker Regression Matrix (Layout + Browse + Find)

## Scope
- Database: `Assets`
- Entities: `Assets`, `Vendors`, `Employees`
- Browse views: `Form`, `List`, `Table`
- Modes: `Browse Mode`, `Find Mode`
- Cross-cutting checks: `Portals`, `Value Lists`, `Inspector attribute propagation`

## Synthetic Data Set
- Vendors (3):
  - `Acme Industrial Supply`
  - `North Harbor Maintenance`
  - `Blue Ridge Services`
- Employees (3):
  - `Avery Chen` (Operations Manager)
  - `Jordan Patel` (Field Technician)
  - `Morgan Diaz` (Warehouse Specialist)
- Assets (3):
  - `Latitude 7440`, serial `SN-7440-1001`
  - `Fluke TiS75+`, serial `SN-TIS75-2002`
  - `Surface Pro 10`, serial `SN-SP10-3003`

## Automated Coverage
- Script: `npm run audit:ddr-inspector`
  - Produces DDR->inspector coverage report: `data/ddr-inspector-mapping-report.json`
- Integration suite (real FileMaker): `npm run test:fm-regression`
  - Creates, edits, deletes, recreates records for all 3 entities
  - Verifies find criteria semantics consistency across Form/List/Table views (data-level)
  - Verifies value list readability (display values)
  - Verifies portal payload structure is present on asset layout records

## Manual UI Regression Cases
1. Browse Mode CRUD across Form/List/Table
   - Create 3 records for Assets, Vendors, Employees.
   - Edit all visible fields on each record.
   - Delete all 3.
   - Recreate all 3 and confirm persisted values.
2. Find Mode across Form/List/Table
   - Enter find mode.
   - Use wildcard criteria on Name (`*Pro*`, `A*`).
   - Use additional criteria on Date/Price fields.
   - Perform find, include and omit requests, then modify last find.
3. Portal behavior
   - On `Asset Details`, confirm portal row creation/edit/delete.
   - Confirm portal sort options affect row ordering.
   - Confirm related values update after save and refresh.
4. Value lists
   - For dropdown/popup/radio/checkbox controls:
     - Confirm human-readable display labels.
     - Confirm stored values are written correctly.
     - Confirm list selection and blur-save behavior.
5. Inspector propagation
   - In each layout, select one field and change one property per inspector tab:
     - Position: move/resize.
     - Styles: style/theme.
     - Appearance: font/line/fill/text baseline.
     - Data: control type/value list/behavior flags.
   - Verify expected change in Browse + Find modes across Form/List/Table.

## Exit Criteria
- No failed save operations on base fields or portal rows.
- Value-list controls show readable labels and persist correct stored values.
- Inspector edits in Layout Mode are reflected consistently in Browse/Find views.
- CRUD + find + portal scenarios pass both automated and manual checks.
