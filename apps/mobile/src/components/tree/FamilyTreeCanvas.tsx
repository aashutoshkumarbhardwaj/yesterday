import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  PanResponder,
  StyleSheet,
  View
} from 'react-native';
import { OrganicTreeRenderer } from './OrganicTreeRenderer';
import { GenealogyGraphRenderer } from './GenealogyGraphRenderer';
import type { TreeLayoutResult, TreeMode, TreePersonNode } from './tree-types';

interface FamilyTreeCanvasProps {
  layout: TreeLayoutResult;
  mode: TreeMode;
  selectedNodeId: string | null;
  highlightedIds?: Set<string>;
  onSelectNode: (node: TreePersonNode) => void;
  onCanvasPress?: () => void;
  onZoomChange?: (scale: number) => void;
}

export interface FamilyTreeCanvasHandle {
  centerOnNode: (node: TreePersonNode) => void;
  fitToScreen: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  resetView: () => void;
  scrollToY: (targetY: number) => void;
}

export const FamilyTreeCanvas = React.forwardRef<FamilyTreeCanvasHandle, FamilyTreeCanvasProps>(
  function FamilyTreeCanvas(
    {
      layout,
      mode,
      selectedNodeId,
      highlightedIds,
      onSelectNode,
      onCanvasPress,
      onZoomChange
    },
    ref
  ) {
    const window = Dimensions.get('window');
    const screenWidth = window.width;
    const screenHeight = window.height - 180; // Account for headers and bottom tabs

    // Pan & Zoom values
    const panX = useRef(new Animated.Value(0)).current;
    const panY = useRef(new Animated.Value(0)).current;
    const scale = useRef(new Animated.Value(1)).current;

    // Numerical trackers for gesture calculations
    const currentScale = useRef(1);
    const currentPanX = useRef(0);
    const currentPanY = useRef(0);

    const prevDistance = useRef<number | null>(null);
    const lastTapTime = useRef<number>(0);

    // Initial center on the tree or focus person
    const fitToScreen = useCallback(() => {
      const { bounds } = layout;
      if (bounds.width === 0 || bounds.height === 0) return;

      const scaleX = (screenWidth - 40) / bounds.width;
      const scaleY = (screenHeight - 60) / bounds.height;
      const targetScale = Math.min(Math.max(Math.min(scaleX, scaleY), 0.55), 1.05);

      const targetX = (screenWidth - bounds.width * targetScale) / 2 - bounds.minX * targetScale;
      const targetY = 30;

      Animated.parallel([
        Animated.spring(scale, { toValue: targetScale, useNativeDriver: true, tension: 40, friction: 7 }),
        Animated.spring(panX, { toValue: targetX, useNativeDriver: true, tension: 40, friction: 7 }),
        Animated.spring(panY, { toValue: targetY, useNativeDriver: true, tension: 40, friction: 7 })
      ]).start(() => {
        currentScale.current = targetScale;
        currentPanX.current = targetX;
        currentPanY.current = targetY;
        onZoomChange?.(targetScale);
      });
    }, [layout, screenWidth, screenHeight, scale, panX, panY, onZoomChange]);

    const centerOnNode = useCallback((node: TreePersonNode) => {
      const targetScale = 1.15;
      const targetX = screenWidth / 2 - node.x * targetScale;
      const targetY = screenHeight / 2.8 - node.y * targetScale;

      Animated.parallel([
        Animated.spring(scale, { toValue: targetScale, useNativeDriver: true, tension: 45, friction: 8 }),
        Animated.spring(panX, { toValue: targetX, useNativeDriver: true, tension: 45, friction: 8 }),
        Animated.spring(panY, { toValue: targetY, useNativeDriver: true, tension: 45, friction: 8 })
      ]).start(() => {
        currentScale.current = targetScale;
        currentPanX.current = targetX;
        currentPanY.current = targetY;
        onZoomChange?.(targetScale);
      });
    }, [screenWidth, screenHeight, scale, panX, panY, onZoomChange]);

    const zoomIn = useCallback(() => {
      const newScale = Math.min(currentScale.current * 1.3, 2.4);
      Animated.spring(scale, { toValue: newScale, useNativeDriver: true }).start(() => {
        currentScale.current = newScale;
        onZoomChange?.(newScale);
      });
    }, [scale, onZoomChange]);

    const zoomOut = useCallback(() => {
      const newScale = Math.max(currentScale.current / 1.3, 0.4);
      Animated.spring(scale, { toValue: newScale, useNativeDriver: true }).start(() => {
        currentScale.current = newScale;
        onZoomChange?.(newScale);
      });
    }, [scale, onZoomChange]);

    const scrollToY = useCallback((targetY: number) => {
      const currentS = currentScale.current;
      const newPanY = screenHeight / 3 - targetY * currentS;
      Animated.spring(panY, { toValue: newPanY, useNativeDriver: true, tension: 45, friction: 8 }).start(() => {
        currentPanY.current = newPanY;
      });
    }, [screenHeight, panY]);

    const resetView = useCallback(() => {
      fitToScreen();
    }, [fitToScreen]);

    // Expose handle methods
    React.useImperativeHandle(ref, () => ({
      centerOnNode,
      fitToScreen,
      zoomIn,
      zoomOut,
      resetView,
      scrollToY
    }), [centerOnNode, fitToScreen, zoomIn, zoomOut, resetView, scrollToY]);

    useEffect(() => {
      fitToScreen();
    }, [mode, layout.nodes.length]);

    // PanResponder for smooth multi-touch gestures (Pan & Pinch)
    const panResponder = useRef(
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, gesture) => {
          return Math.abs(gesture.dx) > 3 || Math.abs(gesture.dy) > 3;
        },
        onPanResponderGrant: (evt) => {
          prevDistance.current = null;
          // Detect double-tap
          const now = Date.now();
          if (now - lastTapTime.current < 300 && evt.nativeEvent.touches.length === 1) {
            zoomIn();
          }
          lastTapTime.current = now;
        },
        onPanResponderMove: (evt, gesture) => {
          const touches = evt.nativeEvent.touches;

          if (touches.length === 2 && touches[0] && touches[1]) {
            // Pinch-to-zoom
            const t1 = touches[0];
            const t2 = touches[1];
            const distance = Math.hypot(t1.pageX - t2.pageX, t1.pageY - t2.pageY);

            if (prevDistance.current !== null) {
              const delta = distance / prevDistance.current;
              const nextScale = Math.min(Math.max(currentScale.current * delta, 0.35), 2.5);
              scale.setValue(nextScale);
              currentScale.current = nextScale;
              onZoomChange?.(nextScale);
            }
            prevDistance.current = distance;
          } else if (touches.length === 1) {
            // 1-Finger Pan
            const newX = currentPanX.current + gesture.dx;
            const newY = currentPanY.current + gesture.dy;
            panX.setValue(newX);
            panY.setValue(newY);
          }
        },
        onPanResponderRelease: (_, gesture) => {
          prevDistance.current = null;
          currentPanX.current += gesture.dx;
          currentPanY.current += gesture.dy;
        }
      })
    ).current;

    return (
      <View style={styles.container} {...panResponder.panHandlers}>
        <Animated.View
          style={[
            styles.canvasTransform,
            {
              transform: [
                { translateX: panX },
                { translateY: panY },
                { scale }
              ]
            }
          ]}
        >
          {mode === 'living_tree' ? (
            <OrganicTreeRenderer
              layout={layout}
              selectedNodeId={selectedNodeId}
              highlightedIds={highlightedIds}
              onSelectNode={onSelectNode}
            />
          ) : (
            <GenealogyGraphRenderer
              layout={layout}
              selectedNodeId={selectedNodeId}
              highlightedIds={highlightedIds}
              onSelectNode={onSelectNode}
            />
          )}
        </Animated.View>
      </View>
    );
  }
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FBF8F3', // Warm parchment background
    overflow: 'hidden'
  },
  canvasTransform: {
    position: 'absolute',
    top: 0,
    left: 0
  }
});

