import React, { memo, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  type ListRenderItem,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius, typography } from '../constants/Theme';

export interface IconPickerProps {
  value: string | null;
  onChange: (name: string) => void;
  accentColor: string;
  searchQuery?: string;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
}

type IconName = keyof typeof Ionicons.glyphMap;

const TILE_HEIGHT = 48;
const NUM_COLUMNS = 4;

interface TileProps {
  name: IconName;
  selected: boolean;
  accentColor: string;
  onPress: (name: IconName) => void;
}

const Tile = memo(function Tile({ name, selected, accentColor, onPress }: TileProps) {
  return (
    <View style={styles.tileWrap}>
      <TouchableOpacity
        onPress={() => onPress(name)}
        activeOpacity={0.7}
        style={[
          styles.tile,
          selected
            ? { backgroundColor: accentColor, borderColor: accentColor }
            : styles.tileUnselected,
        ]}
      >
        <Ionicons
          name={name}
          size={22}
          color={selected ? '#FFFFFF' : colors.textPrimary}
        />
      </TouchableOpacity>
    </View>
  );
});

function IconPickerImpl({
  value,
  onChange,
  accentColor,
  searchQuery,
  style,
  contentContainerStyle,
}: IconPickerProps) {
  const initialValueRef = useRef(value);

  const sortedIconNames = useMemo(() => {
    const sorted = Object.keys(Ionicons.glyphMap).sort() as IconName[];
    const initial = initialValueRef.current;
    if (!initial) return sorted;
    const rest = sorted.filter((n) => n !== initial);
    return [initial as IconName, ...rest];
  }, []);

  const filteredIconNames = useMemo(() => {
    const q = (searchQuery ?? '').trim().toLowerCase();
    if (!q) return sortedIconNames;
    const alphabetical = Object.keys(Ionicons.glyphMap).sort() as IconName[];
    return alphabetical.filter((n) => n.toLowerCase().includes(q));
  }, [searchQuery, sortedIconNames]);

  const handlePress = useCallback(
    (name: IconName) => {
      onChange(name);
    },
    [onChange],
  );

  const keyExtractor = useCallback((name: IconName) => name, []);

  const renderItem = useCallback<ListRenderItem<IconName>>(
    ({ item }) => (
      <Tile
        name={item}
        selected={value === item}
        accentColor={accentColor}
        onPress={handlePress}
      />
    ),
    [value, accentColor, handlePress],
  );

  const ListEmpty = useMemo(
    () => (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>No icons match</Text>
      </View>
    ),
    [],
  );

  return (
    <FlatList
      data={filteredIconNames}
      keyExtractor={keyExtractor}
      renderItem={renderItem}
      numColumns={NUM_COLUMNS}
      style={style}
      contentContainerStyle={contentContainerStyle}
      ListEmptyComponent={ListEmpty}
      initialNumToRender={16}
      maxToRenderPerBatch={16}
      windowSize={3}
      removeClippedSubviews
      nestedScrollEnabled
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator
    />
  );
}

export const IconPicker = memo(IconPickerImpl);

const styles = StyleSheet.create({
  emptyContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  emptyText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  tileWrap: {
    width: `${100 / NUM_COLUMNS}%`,
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.md,
  },
  tile: {
    height: TILE_HEIGHT,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileUnselected: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
});
