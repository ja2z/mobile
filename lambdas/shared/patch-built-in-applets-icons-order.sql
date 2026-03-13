-- Patch built_in_applets: restore icon_name and sort_order from original hardcoded values
-- Source: git history (7ca668c Reorganize applets, 062d221 Add BBM Usage)
-- Run against existing Postgres database to fix applets that were seeded with null icons and sort_order 0
-- Usage: Run via psql, run-migration, or your DB migration tool

UPDATE built_in_applets SET icon_name = 'briefcase-outline', sort_order = 10 WHERE applet_id = '2';
UPDATE built_in_applets SET icon_name = 'git-network-outline', sort_order = 10 WHERE applet_id = '7';
UPDATE built_in_applets SET icon_name = 'trending-up-outline', sort_order = 10 WHERE applet_id = '8';
UPDATE built_in_applets SET icon_name = 'chatbubbles-outline', sort_order = 20 WHERE applet_id = '10';
UPDATE built_in_applets SET icon_name = 'bar-chart-outline', sort_order = 30 WHERE applet_id = '11';
UPDATE built_in_applets SET icon_name = 'chatbubbles-outline', sort_order = 10 WHERE applet_id = '9';
UPDATE built_in_applets SET icon_name = 'chatbubbles-outline', sort_order = 20 WHERE applet_id = '6';
UPDATE built_in_applets SET icon_name = 'chatbubbles-outline', sort_order = 30 WHERE applet_id = '5';
UPDATE built_in_applets SET icon_name = 'sparkles-outline', sort_order = 40 WHERE applet_id = '3';
