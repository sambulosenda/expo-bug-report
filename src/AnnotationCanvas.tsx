import React, { useState, useCallback, useRef } from 'react';
import { View, Image, TouchableOpacity, Text, type ColorSchemeName } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import {
  GestureDetector,
  Gesture,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import { captureRef } from 'react-native-view-shot';
import { useThemeColors } from './useThemeColors';

interface AnnotationCanvasProps {
  screenshotUri: string;
  onAnnotationComplete: (annotatedUri: string) => void;
  onSkip: () => void;
  width: number;
  height: number;
  colorScheme?: ColorSchemeName;
}

interface PathData {
  d: string;
  color: string;
}

const PEN_COLORS = ['#FF3B30', '#007AFF', '#FFCC00', '#FFFFFF'];

export function AnnotationCanvas({
  screenshotUri,
  onAnnotationComplete,
  onSkip,
  width,
  height,
  colorScheme,
}: AnnotationCanvasProps) {
  const colors = useThemeColors(colorScheme);
  const [paths, setPaths] = useState<PathData[]>([]);
  const [currentPath, setCurrentPath] = useState<string>('');
  const [selectedColor, setSelectedColor] = useState(PEN_COLORS[0]!);
  const currentPathRef = useRef<string>('');
  const selectedColorRef = useRef(selectedColor);
  const compositeRef = useRef<View>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Keep ref in sync with state for gesture handler
  selectedColorRef.current = selectedColor;

  const panGesture = Gesture.Pan()
    .onStart((event) => {
      const newPath = `M${event.x},${event.y}`;
      currentPathRef.current = newPath;
      setCurrentPath(newPath);
    })
    .onUpdate((event) => {
      const updated = `${currentPathRef.current} L${event.x},${event.y}`;
      currentPathRef.current = updated;
      setCurrentPath(updated);
    })
    .onEnd(() => {
      const pathToSave = currentPathRef.current;
      if (pathToSave) {
        setPaths((prev) => [...prev, { d: pathToSave, color: selectedColorRef.current }]);
        currentPathRef.current = '';
        setCurrentPath('');
      }
    })
    .minDistance(0);

  const handleUndo = useCallback(() => {
    setPaths((prev) => prev.slice(0, -1));
  }, []);

  const handleClear = useCallback(() => {
    setPaths([]);
  }, []);

  const handleDone = useCallback(async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      const uri = await captureRef(compositeRef, {
        format: 'png',
        quality: 0.9,
        result: 'tmpfile',
      });
      onAnnotationComplete(uri);
    } catch {
      onSkip();
    } finally {
      setIsSaving(false);
    }
  }, [isSaving, onAnnotationComplete, onSkip]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={{ flex: 1 }}>
        <View
          ref={compositeRef}
          collapsable={false}
          style={{ width, height, position: 'relative' }}
        >
          <Image
            source={{ uri: screenshotUri }}
            style={{ width, height }}
            resizeMode="contain"
          />
          <GestureDetector gesture={panGesture}>
            <Svg
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width,
                height,
              }}
            >
              {paths.map((path, index) => (
                <Path
                  key={index}
                  d={path.d}
                  stroke={path.color}
                  strokeWidth={3}
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ))}
              {currentPath ? (
                <Path
                  d={currentPath}
                  stroke={selectedColor}
                  strokeWidth={3}
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ) : null}
            </Svg>
          </GestureDetector>
        </View>

        {/* Toolbar */}
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingHorizontal: 16,
            paddingVertical: 12,
            backgroundColor: colors.background,
            borderTopWidth: 1,
            borderTopColor: colors.border,
          }}
        >
          {/* Left: Undo + Clear */}
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <TouchableOpacity
              onPress={handleUndo}
              disabled={paths.length === 0}
              accessibilityRole="button"
              accessibilityLabel="Undo last drawing"
            >
              <Text
                style={{
                  fontSize: 16,
                  color: paths.length === 0 ? colors.disabled : colors.primary,
                }}
              >
                Undo
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleClear}
              disabled={paths.length === 0}
              accessibilityRole="button"
              accessibilityLabel="Clear all drawings"
            >
              <Text
                style={{
                  fontSize: 16,
                  color: paths.length === 0 ? colors.disabled : colors.error,
                }}
              >
                Clear
              </Text>
            </TouchableOpacity>
          </View>

          {/* Center: Color picker */}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {PEN_COLORS.map((color) => (
              <TouchableOpacity
                key={color}
                onPress={() => setSelectedColor(color)}
                accessibilityRole="button"
                accessibilityLabel={`Select ${color} pen color`}
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 12,
                  backgroundColor: color,
                  borderWidth: selectedColor === color ? 2 : 1,
                  borderColor: selectedColor === color ? colors.primary : colors.border,
                }}
              />
            ))}
          </View>

          {/* Right: Skip + Done */}
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <TouchableOpacity
              onPress={onSkip}
              accessibilityRole="button"
              accessibilityLabel="Skip annotation"
            >
              <Text style={{ fontSize: 16, color: colors.textSecondary }}>Skip</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleDone}
              disabled={isSaving}
              accessibilityRole="button"
              accessibilityLabel="Done annotating"
            >
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: '600',
                  color: isSaving ? colors.disabled : colors.primary,
                }}
              >
                Done
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </GestureHandlerRootView>
  );
}
