# Sigma formula: radar chart image URL

Use a **formula column** with the column type set to **Image** (or URL, depending on your workbook).

**Base URL:** `https://radar-chart.netlify.app/.netlify/functions/radar`

Hex values below are **without** `#` for the `color=` parameter.

## Persona colors (estimated from brand images)

| Persona | Archetype ID values to match (examples) | `color` |
|---------|----------------------------------------|---------|
| The Data Democratizer | `data_democratizer`, `27`, `The Data Democratizer`, `Data Democratizer` | `00AEEF` |
| The Speed Demon | `speed_chaser`, `15`, `The Speed Demon`, `Speed Demon` | `E35D5B` |
| The Insight Hunter | `embedded_builder`, `19`, `The Insight Hunter`, `Insight Hunter` | `4B906F` |
| The Collaboration Chief | `collaboration_chief`, `The Collaboration Chief`, `Collaboration Chief` | `D47E16` |
| The Governance Guardian | `governance_guardian`, `23`, `The Governance Guardian`, `Governance Guardian` | `7C3AED` |

**Not shown in the image set:** if you still use `migration_escapee` / `10` or `executive_storyteller`, adjust the `Switch` cases below to your real IDs or remove them.

## Formula (paste and rename columns)

```
Concat(
  "https://radar-chart.netlify.app/.netlify/functions/radar?",
  "l1=Scale&v1=", Text([Scale]),
  "&l2=Speed&v2=", Text([Speed]),
  "&l3=Governance&v3=", Text([Governance]),
  "&l4=Self-service&v4=", Text([Self-service]),
  "&l5=Collaboration&v5=", Text([Collaboration]),
  "&color=",
  Switch(
    Text([Archetype ID]),
    "data_democratizer", "00AEEF",
    "27", "00AEEF",
    "The Data Democratizer", "00AEEF",
    "Data Democratizer", "00AEEF",
    "speed_chaser", "E35D5B",
    "15", "E35D5B",
    "The Speed Demon", "E35D5B",
    "Speed Demon", "E35D5B",
    "embedded_builder", "4B906F",
    "19", "4B906F",
    "The Insight Hunter", "4B906F",
    "Insight Hunter", "4B906F",
    "collaboration_chief", "D47E16",
    "The Collaboration Chief", "D47E16",
    "Collaboration Chief", "D47E16",
    "governance_guardian", "7C3AED",
    "23", "7C3AED",
    "The Governance Guardian", "7C3AED",
    "Governance Guardian", "7C3AED",
    "migration_escapee", "64748B",
    "10", "64748B",
    "executive_storyteller", "8B5CF6",
    "6B7280"
  ),
  "&max=100"
)
```

## Notes

- If **`[Archetype ID]`** values differ (e.g. only numeric IDs), delete unused string cases and keep the numbers you use.
- **`Collaboration`** in the URL is the *dimension name* (fifth metric). **`Collaboration Chief`** is a *persona name* in the color `Switch`—they are unrelated.
- Tweak hex if you sample exact brand values from design files later.
