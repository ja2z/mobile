import React, { useEffect, useState, useRef } from 'react';
import { NavigationContainer, CommonActions } from '@react-navigation/native';
import type { RouteProp, Theme } from '@react-navigation/native';
import {
  createStackNavigator,
  CardStyleInterpolators,
  type StackNavigationOptions,
  type StackNavigationProp,
  type StackCardStyleInterpolator,
  type StackHeaderStyleInterpolator,
} from '@react-navigation/stack';
import { StatusBar } from 'expo-status-bar';
import * as Linking from 'expo-linking';
import {
  View,
  StyleSheet,
  Animated,
  Pressable,
  Platform,
  Alert,
  Easing,
  useWindowDimensions,
} from 'react-native';
import Login from './(tabs)/Login';
import ExpiredLink from './(tabs)/ExpiredLink';
import Home from './(tabs)/Home';
import Dashboard from './(tabs)/Dashboard';
import ConversationalAI from './(tabs)/ConversationalAI';
import Operations from './(tabs)/Operations';
import GenericAppletView from './(tabs)/GenericAppletView';
import Admin from './(tabs)/Admin';
import ActivityLog from './(tabs)/ActivityLog';
import EditUser from './(tabs)/EditUser';
import AddWhitelistUser from './(tabs)/AddWhitelistUser';
import MyBuys from './(tabs)/MyBuys';
import AddMyBuysApplet from './(tabs)/AddMyBuysApplet';
import EditMyBuysApplet from './(tabs)/EditMyBuysApplet';
import ViewMyBuysApplet from './(tabs)/ViewMyBuysApplet';
import Sigmanauts from './(tabs)/Sigmanauts';
import AI from './(tabs)/AI';
import Dashboards from './(tabs)/Dashboards';
import Apps from './(tabs)/Apps';
import PhoneVerification from './(tabs)/PhoneVerification';
import CollectName from './(tabs)/CollectName';
import Toast from 'react-native-toast-message';
import { colors, spacing } from '../constants/Theme';
import { AuthService } from '../services/AuthService';
import { ActivityService } from '../services/ActivityService';
import { listBuiltInApplets } from '../services/BuiltInAppletsService';
import { MyBuysService } from '../services/MyBuysService';
import {
  getLoginLogoTarget,
  loginLogoOpacity,
  type LoginLogoTarget,
} from '../constants/LoginLogoTransition';
import { getCardHeroSourceForRoute } from '../constants/CardHeroTransition';

// Define the navigation stack parameter list
export type RootStackParamList = {
  Login: undefined;
  ExpiredLink: { email?: string; errorType?: 'expired' | 'invalid' | 'used' };
  Home: undefined;
  Dashboard: { appletId?: string; appletName?: string; workbookId?: string; slug?: string; embedPath?: string; name?: string; pageId?: string; variables?: Record<string, string> };
  ConversationalAI: { appletId?: string; appletName?: string; workbookId?: string; slug?: string; embedPath?: string; name?: string; pageId?: string; variables?: Record<string, string> };
  Operations: { appletId?: string; appletName?: string; workbookId?: string; slug?: string; embedPath?: string; name?: string; pageId?: string; variables?: Record<string, string> };
  GenericAppletView: { appletId?: string; appletName?: string; workbookId?: string; slug?: string; embedPath?: string; name?: string; pageId?: string; variables?: Record<string, string> };
  Admin: { initialTab?: 'users' | 'whitelist' | 'activityLog'; emailFilter?: string; showDeactivated?: boolean } | undefined;
  ActivityLog: undefined;
  EditUser: { user: import('../services/AdminService').User };
  AddWhitelistUser: undefined;
  MyBuys: undefined;
  AddMyBuysApplet: undefined;
  EditMyBuysApplet: { appletId: string };
  ViewMyBuysApplet: { appletId: string; pageId?: string; variables?: Record<string, string> };
  Sigmanauts: undefined;
  AI: undefined;
  Dashboards: undefined;
  Apps: undefined;
  PhoneVerification: undefined;
  CollectName:
    | {
        pendingDeepLink?: {
          screen: keyof RootStackParamList;
          params: Record<string, unknown>;
        };
      }
    | undefined;
};

type MyBuysAppletModalOptionsArgs =
  | {
      route: RouteProp<RootStackParamList, 'AddMyBuysApplet'>;
      navigation: StackNavigationProp<RootStackParamList, 'AddMyBuysApplet'>;
      theme: Theme;
    }
  | {
      route: RouteProp<RootStackParamList, 'EditMyBuysApplet'>;
      navigation: StackNavigationProp<RootStackParamList, 'EditMyBuysApplet'>;
      theme: Theme;
    };

/** Same easing as scale-from-center stock preset; open quicker, close more leisurely (shared curve). */
const MY_BUYS_APPLET_MODAL_TRANSITION_SPEC = {
  open: {
    animation: 'timing' as const,
    config: {
      duration: 280,
      easing: Easing.bezier(0.20833, 0.82, 0.25, 1),
    },
  },
  close: {
    animation: 'timing' as const,
    config: {
      duration: 480,
      easing: Easing.bezier(0.20833, 0.82, 0.25, 1),
    },
  },
};

/** Shared transparent card modal for Add / Edit My Apps applet (backdrop + scale animation). */
function myBuysAppletModalScreenOptions(title: string) {
  return ({ navigation }: MyBuysAppletModalOptionsArgs): StackNavigationOptions => ({
    title,
    headerShown: true,
    presentation: 'transparentModal' as const,
    animation: 'scale_from_center' as const,
    transitionSpec: MY_BUYS_APPLET_MODAL_TRANSITION_SPEC,
    cardStyleInterpolator: (props: Parameters<typeof CardStyleInterpolators.forScaleFromCenterAndroid>[0]) => {
      const base = CardStyleInterpolators.forScaleFromCenterAndroid(props);
      const overlayOpacity = props.current.progress.interpolate({
        inputRange: [0, 1],
        outputRange: [0, 1],
        extrapolate: 'clamp',
      });
      return {
        ...base,
        overlayStyle: { opacity: overlayOpacity },
      };
    },
    gestureEnabled: true,
    cardOverlayEnabled: true,
    cardOverlay: ({ style }) => (
      <Animated.View style={[style, StyleSheet.absoluteFill]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => navigation.goBack()}>
          <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.45)' }]} />
        </Pressable>
      </Animated.View>
    ),
    headerStatusBarHeight: 0,
    headerStyle: {
      backgroundColor: colors.folderSections.myBuys,
      elevation: 0,
      shadowOpacity: 0,
      borderBottomWidth: 0,
      height: Platform.OS === 'ios' ? 48 : 52,
    },
    headerTintColor: colors.background,
    headerTitleStyle: {
      fontSize: 17,
      fontWeight: '600' as const,
    },
    headerLeftContainerStyle: { paddingLeft: 4 },
    headerTitleContainerStyle: {
      marginHorizontal: 0,
    },
    headerTransparent: false,
    cardShadowEnabled: false,
    cardStyle: {
      marginHorizontal: 28 + spacing.sm,
      marginTop: 92 + spacing.sm,
      marginBottom: 72 + spacing.sm,
      borderRadius: 20,
      backgroundColor: colors.background,
      overflow: 'hidden',
      ...Platform.select({
        ios: {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 10 },
          shadowOpacity: 0.28,
          shadowRadius: 20,
        },
        default: {
          elevation: 18,
        },
      }),
    },
  });
}

/**
 * Timing spec shared by every hero-transition route. 480ms forward / 360ms
 * back with a smooth Bezier easing, matching the splash -> Login logo
 * settle so the two transitions feel like they belong to the same app.
 */
const HERO_TRANSITION_SPEC = {
  open: {
    animation: 'timing' as const,
    config: {
      duration: 576,
      easing: Easing.bezier(0.20833, 0.82, 0.25, 1),
    },
  },
  close: {
    animation: 'timing' as const,
    config: {
      duration: 432,
      easing: Easing.bezier(0.20833, 0.82, 0.25, 1),
    },
  },
};

/**
 * Default card style interpolator applied to every screen in the stack via
 * `screenOptions`. It only animates the entering screen's opacity (no
 * translation), which means the previous screen is held in place while a
 * new screen fades in on top. This removes the horizontal slide that
 * otherwise bleeds through the hero transition and makes every non-hero
 * screen a plain crossfade by default.
 */
const heroDefaultCardStyleInterpolator: StackCardStyleInterpolator = ({
  current,
}) => ({
  cardStyle: { opacity: current.progress },
});

/**
 * Build a card style interpolator for a hero-destination route. When a
 * `CardHeroSource` is registered for the route (source screen measured the
 * tapped card and called `setCardHeroSourceForRoute` before navigating),
 * the destination card uses asymmetric open/close curves so each direction
 * feels right on its own:
 *
 * Open (`closing === false`) — two-phase "window into the folder":
 *  1. Phase 1 (progress 0 → ~0.4): the card sits at the tapped tile's
 *     exact rect — scaled down to `rect.width / screen.width` and
 *     translated so its center lands on the tile's center — while its
 *     opacity ramps 0 → 1. Visually this is a small, faded preview
 *     appearing inside the tile, as if peeking through a window.
 *  2. Phase 2 (progress ~0.25 → 1): scale interpolates back to 1 and
 *     translate back to (0, 0), so the preview grows out to fill the
 *     screen. Phases overlap slightly (0.25–0.40) so the hand-off feels
 *     natural rather than robotic.
 *
 * Close (`closing === true`) — smooth monotonic shrink+fade:
 *   Using the open curves in reverse made the tiny card park on the tile
 *   rect (high on Home) for the final ~25% while fading out — it felt
 *   "stuck up top". For close we instead interpolate scale + translate
 *   linearly from full-screen down to the tile rect, with opacity falling
 *   straight 1 → 0 across the whole close. The card shrinks toward the
 *   folder while fading simultaneously and never parks.
 *
 * When no source is registered (deep link, imperative reset, etc.), the
 * interpolator falls back to the global crossfade so the screen still
 * animates in cleanly.
 */
function makeHeroFromRectInterpolator(
  routeName: string,
): StackCardStyleInterpolator {
  return ({ current, closing, layouts: { screen } }) => {
    const src = getCardHeroSourceForRoute(routeName);
    if (!src || screen.width <= 0 || screen.height <= 0) {
      return { cardStyle: { opacity: current.progress } };
    }

    const initialScale = Math.max(src.rect.width / screen.width, 0.01);
    /**
     * Offset from screen center to the tile's center. RN applies transforms
     * around the view's own center, so translating by this delta parks the
     * scaled-down card on top of the tile's rect.
     */
    const dx = src.rect.x + src.rect.width / 2 - screen.width / 2;
    const dy = src.rect.y + src.rect.height / 2 - screen.height / 2;

    /**
     * Top-row parked drop. Because the card is parked with its CENTER on the
     * tile's center and scaled uniformly by `initialScale = tile.w/screen.w`,
     * the scaled card's extent (`screen.h * initialScale`) is much taller
     * than the tile — its TOP edge in world space sits at
     *
     *   scaledCardTop = tile_center_y − screen.h * initialScale / 2
     *
     * For tiles in the top row of Home (My Apps, Sigmanauts) that value is
     * near zero, so the parked card's top — and everything inside it,
     * including the header title and back arrow — sits at the very top of
     * the screen. The user reads that as "the card and its heading come
     * from the top of the screen" instead of from the tapped tile.
     *
     * Fix: push the whole parked card DOWN by `src.rect.y − scaledCardTop`
     * so the card's top edge lands on the tile's top edge at parked. This
     * shifts the header content (a child of the card) along with the card
     * body, so the heading visually emerges from the tile instead of from
     * the top of the screen — and it still relaxes to 0 by progress 1 so
     * the final full-screen card position is unchanged.
     *
     * Applied symmetrically to open and close so the back transition
     * shrinks the card back to the tile's top edge rather than parking on
     * the tile center (which would feel like two different animations).
     *
     * Middle/bottom row tiles hit `needsTopAnchor === false` and use the
     * original curves (parked center-on-tile) without any adjustment.
     */
    const scaledCardTop =
      src.rect.y + src.rect.height / 2 - (screen.height * initialScale) / 2;
    const needsTopAnchor =
      scaledCardTop < 0 || src.rect.y < screen.height / 3;
    const parkedDy = needsTopAnchor ? dy + (src.rect.y - scaledCardTop) : dy;

    if (closing) {
      return {
        cardStyle: {
          opacity: current.progress,
          transform: [
            {
              translateX: current.progress.interpolate({
                inputRange: [0, 1],
                outputRange: [dx, 0],
              }),
            },
            {
              translateY: current.progress.interpolate({
                inputRange: [0, 1],
                outputRange: [parkedDy, 0],
              }),
            },
            {
              scale: current.progress.interpolate({
                inputRange: [0, 1],
                outputRange: [initialScale, 1],
              }),
            },
          ],
        },
      };
    }

    return {
      cardStyle: {
        opacity: current.progress.interpolate({
          inputRange: [0, 0.4, 1],
          outputRange: [0, 1, 1],
        }),
        transform: [
          {
            translateX: current.progress.interpolate({
              inputRange: [0, 0.25, 1],
              outputRange: [dx, dx, 0],
            }),
          },
          {
            translateY: current.progress.interpolate({
              inputRange: [0, 0.25, 1],
              outputRange: [parkedDy, parkedDy, 0],
            }),
          },
          {
            scale: current.progress.interpolate({
              inputRange: [0, 0.25, 1],
              outputRange: [initialScale, initialScale, 1],
            }),
          },
        ],
      },
    };
  };
}

/**
 * Header style interpolator paired with the hero card interpolator.
 *
 * The card sits inside a `headerMode: 'screen'` stack, so the header is a
 * child of the scaling+translating card. An earlier fix held the header
 * content fully invisible during the scale phase and faded it in only at
 * the tail of open (opacity 0 during progress 0 → 0.7, 0 → 1 during
 * 0.7 → 1). That killed the stretched-text look, but meant the title and
 * back arrow simply popped into place once the card had arrived — the
 * body of the card visibly traveled, the header content did not.
 *
 * This version keeps that clean-bg + late-fade feel and adds a
 * **counter-scale** to the title / back / right button so they stay at
 * native size throughout the transition. The card scale curve is:
 *
 *   scale(progress) = piecewise [0, 0.25, 1] -> [initialScale, initialScale, 1]
 *
 * So we drive an inverse scale on each header element:
 *
 *   invScale(progress) = [0, 0.25, 1] -> [1/initialScale, 1/initialScale, 1]
 *
 * Net effect: parent down-scales child by S, child scales itself by 1/S
 * around its own center — visible size stays native. But the child's
 * POSITION is still dictated by the scaled+translated parent, so the
 * title and back arrow's world-space anchor travels from the tile
 * (where the card is parked during progress 0 → 0.25) up into the
 * header slot as the card grows to full-screen. Combined with a
 * 0 → 0.4 → 1 opacity fade-in they visibly ride the card into place
 * instead of popping at the end.
 *
 * `backgroundStyle.opacity = 1` throughout so the header strip continues
 * to read as a solid extension of the card's own background (no seam,
 * no peek-through to Home during the grow).
 *
 * `initialScale` MUST match `makeHeroFromRectInterpolator`'s scale
 * curve. If that card interpolator is retuned, this inverse curve has
 * to follow in lockstep or the header content will drift in size.
 *
 * ---
 * **Top-row anchor shift.** Moved into `makeHeroFromRectInterpolator`:
 * the card body's parked `translateY` is pushed down so the scaled
 * card's TOP edge lands on the tile's top edge (not near y=0). Because
 * the header is a child of the card, that single shift repositions the
 * header in world space along with the rest of the card — no separate
 * translate is required here. This interpolator therefore only
 * counter-scales the header content and fades it in; all vertical
 * positioning is delegated to the card interpolator.
 *
 * When no hero source is registered (deep link, imperative reset, etc.)
 * we fall back to the plain opacity-only fade — same as the previous
 * implementation — because there's no rect to derive a scale from.
 */
function makeHeroHeaderStyleInterpolator(
  routeName: string,
): StackHeaderStyleInterpolator {
  return ({ current, layouts: { screen } }) => {
    const contentOpacity = current.progress.interpolate({
      inputRange: [0, 0.4, 1],
      outputRange: [0, 0, 1],
      extrapolate: 'clamp',
    });

    const src = getCardHeroSourceForRoute(routeName);
    if (!src || screen.width <= 0) {
      return {
        leftButtonStyle: { opacity: contentOpacity },
        rightButtonStyle: { opacity: contentOpacity },
        titleStyle: { opacity: contentOpacity },
        backgroundStyle: { opacity: 1 },
      };
    }

    const initialScale = Math.max(src.rect.width / screen.width, 0.01);
    const inverseScale = current.progress.interpolate({
      inputRange: [0, 0.25, 1],
      outputRange: [1 / initialScale, 1 / initialScale, 1],
      extrapolate: 'clamp',
    });

    const contentTransform = [{ scale: inverseScale }];

    return {
      leftButtonStyle: { opacity: contentOpacity, transform: contentTransform },
      rightButtonStyle: { opacity: contentOpacity, transform: contentTransform },
      titleStyle: { opacity: contentOpacity, transform: contentTransform },
      backgroundStyle: { opacity: 1 },
    };
  };
}

/**
 * Screen options preset for every hero-destination route. The per-route
 * interpolator is constructed by the caller via
 * `makeHeroFromRectInterpolator(routeName)` so it reads the correct source
 * out of the bus at transition start.
 */
function heroDestinationScreenOptions(
  routeName: string,
): StackNavigationOptions {
  return {
    transitionSpec: HERO_TRANSITION_SPEC,
    cardStyleInterpolator: makeHeroFromRectInterpolator(routeName),
    /**
     * iOS default `headerMode: 'float'` renders one shared header layer
     * above every card with its own independent animation, so the header
     * appears to slide/pop in separately from the card that's fading +
     * scaling underneath it. `headerMode: 'screen'` attaches the header
     * to THIS screen's card, so the header fades and scales together
     * with the rest of the destination — the whole folder content
     * (header bar included) pops in and fades as a single unit.
     *
     * `makeHeroHeaderStyleInterpolator(routeName)` pairs with that: the
     * header BACKGROUND stays solid throughout so the growing card has
     * no seam at the top, while the title / back arrow are
     * counter-scaled (inverse of the card's scale curve) so they stay
     * at native size. Their world-space positions still follow the
     * scaled+translated parent, which means they visibly travel from
     * the tile area into the header slot as the card grows, fading
     * in from 0.4 → 1 along the way — "the header moves into place
     * like everything else". Factory-based because we need the
     * per-route hero source (rect) to derive initialScale.
     */
    headerMode: 'screen',
    headerStyleInterpolator: makeHeroHeaderStyleInterpolator(routeName),
    cardShadowEnabled: false,
    cardOverlayEnabled: false,
    gestureEnabled: true,
  };
}

const Stack = createStackNavigator<RootStackParamList>();

type LoadingScreenProps = {
  shouldExit: boolean;
  onExitComplete: () => void;
  /**
   * When true, the exit animation settles the overlay logo onto the Login
   * screen's underlying logo (scale-down + translate + container fade) for a
   * seamless reveal. When false, falls back to the original zoom-out + fade
   * (used for authenticated boots that go straight to Home, etc.).
   */
  coordinateWithLoginLogo: boolean;
};

/**
 * Full-screen white overlay that holds the zeta icon while the app boots.
 * When `shouldExit` flips true it plays either a coordinated "settle"
 * transition (scale+translate onto Login's logo then fade the bg) or the
 * fallback "zoom-in + fade-out" transition, then calls `onExitComplete`.
 */
function LoadingScreen({
  shouldExit,
  onExitComplete,
  coordinateWithLoginLogo,
}: LoadingScreenProps) {
  const { width: screenW, height: screenH } = useWindowDimensions();
  const scale = useRef(new Animated.Value(1)).current;
  const logoOpacity = useRef(new Animated.Value(1)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const containerOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!shouldExit) return;

    let cancelled = false;

    const runCoordinated = (target: LoginLogoTarget) => {
      const overlaySize = 310;
      const scaleTarget = target.size / overlaySize;
      const dx = target.centerX - screenW / 2;
      const dy = target.centerY - screenH / 2;

      /**
       * Run the logo settle + background fade in parallel (with a short fade
       * delay) so the Login content behind the overlay reveals progressively
       * as the logo is still moving — feels like everything loads in together
       * rather than "move, then reveal".
       */
      Animated.parallel([
        Animated.timing(scale, {
          toValue: scaleTarget,
          duration: 750,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(translateX, {
          toValue: dx,
          duration: 750,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: dy,
          duration: 750,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.delay(150),
          Animated.timing(containerOpacity, {
            toValue: 0,
            duration: 700,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
        /**
         * Reveal Login's underlying logo AFTER the overlay logo has landed on
         * top of it at t=750. Before this, Login's logo is held at opacity 0
         * so it cannot visually overlap the moving overlay logo. Because the
         * overlay logo stays fully opaque at the same position and size, this
         * reveal is hidden from the user — it's just a handoff so that when
         * the overlay unmounts, Login's logo is already visible in its place.
         */
        Animated.sequence([
          Animated.delay(750),
          Animated.timing(loginLogoOpacity, {
            toValue: 1,
            duration: 100,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
      ]).start(({ finished }) => {
        if (finished && !cancelled) onExitComplete();
      });
    };

    const runFallback = () => {
      Animated.parallel([
        Animated.timing(scale, {
          toValue: 2.2,
          duration: 550,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(logoOpacity, {
          toValue: 0,
          duration: 550,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished && !cancelled) onExitComplete();
      });
    };

    if (!coordinateWithLoginLogo) {
      runFallback();
      return () => {
        cancelled = true;
      };
    }

    /** Poll briefly for the target in case Login hasn't measured yet. */
    const deadline = Date.now() + 200;
    const tryStart = () => {
      if (cancelled) return;
      const target = getLoginLogoTarget();
      if (target) {
        runCoordinated(target);
      } else if (Date.now() < deadline) {
        requestAnimationFrame(tryStart);
      } else {
        runFallback();
      }
    };
    tryStart();

    return () => {
      cancelled = true;
    };
  }, [
    shouldExit,
    coordinateWithLoginLogo,
    scale,
    logoOpacity,
    translateX,
    translateY,
    containerOpacity,
    onExitComplete,
    screenW,
    screenH,
  ]);

  return (
    <View
      style={styles.loadingContainer}
      pointerEvents={shouldExit ? 'none' : 'auto'}
    >
      <StatusBar style="auto" />
      {/*
        White background is a sibling of the logo (not a parent) so fading it
        does not fade the logo. Coordinated transition: bg fades while logo
        only moves. Fallback transition: bg stays opaque, logo zooms + fades.
      */}
      <Animated.View
        style={[styles.loadingBackground, { opacity: containerOpacity }]}
        pointerEvents="none"
      />
      {/*
        shouldRasterizeIOS / renderToHardwareTextureAndroid tell the platform
        to cache this view as a GPU texture once, so the scale+translate
        animation becomes a cheap bitmap blit each frame instead of resampling
        the 1024x1024 source PNG. fadeDuration=0 disables Android's default
        image fade-in so it can't interrupt our animation on first paint.
      */}
      <Animated.Image
        source={require('../assets/zeta_solid_purple_6B2A87_1024x1024_cropped_transparent.png')}
        style={[
          styles.zetaIcon,
          {
            opacity: logoOpacity,
            transform: [
              { translateX },
              { translateY },
              { scale },
            ],
          },
        ]}
        resizeMode="contain"
        resizeMethod="scale"
        fadeDuration={0}
        shouldRasterizeIOS
        renderToHardwareTextureAndroid
      />
    </View>
  );
}

type MagicLinkVerifyingOverlayProps = {
  visible: boolean;
};

/**
 * Warm-handler verification overlay. The main boot `LoadingScreen` has already
 * exited in this case (user was on Login when they tapped the magic link), so
 * there is nothing covering the Login screen while `handleDeepLink` verifies
 * the token and the `NavigationContainer` remounts from Login to Home. This
 * overlay matches the boot splash visuals (white bg + zeta logo) and covers
 * that entire window, then fades out to reveal the target screen.
 *
 * Cold boot is unaffected: RootLayout only renders this when `hasExited` is
 * true, so the main boot splash keeps ownership of the initial transition.
 */
function MagicLinkVerifyingOverlay({ visible }: MagicLinkVerifyingOverlayProps) {
  const opacity = useRef(new Animated.Value(0)).current;
  const [shouldRender, setShouldRender] = useState(visible);

  useEffect(() => {
    let cancelled = false;
    let rafId1: number | null = null;
    let rafId2: number | null = null;

    if (visible) {
      setShouldRender(true);
      Animated.timing(opacity, {
        toValue: 1,
        duration: 120,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();
    } else {
      /**
       * Defer the fade-out by two RAFs so the NavigationContainer remount and
       * the target screen's first paint both land under the overlay. Without
       * this, there can be a 1-frame empty flash between Login unmount and
       * Home mount as the overlay reveals.
       */
      rafId1 = requestAnimationFrame(() => {
        rafId2 = requestAnimationFrame(() => {
          if (cancelled) return;
          Animated.timing(opacity, {
            toValue: 0,
            duration: 220,
            easing: Easing.in(Easing.quad),
            useNativeDriver: true,
          }).start(({ finished }) => {
            if (finished && !cancelled) {
              setShouldRender(false);
            }
          });
        });
      });
    }

    return () => {
      cancelled = true;
      if (rafId1 !== null) cancelAnimationFrame(rafId1);
      if (rafId2 !== null) cancelAnimationFrame(rafId2);
    };
  }, [visible, opacity]);

  if (!shouldRender) return null;

  return (
    <Animated.View
      style={[styles.loadingContainer, { opacity }]}
      pointerEvents={visible ? 'auto' : 'none'}
    >
      <View style={styles.loadingBackground} pointerEvents="none" />
      <Animated.Image
        source={require('../assets/zeta_solid_purple_6B2A87_1024x1024_cropped_transparent.png')}
        style={styles.zetaIcon}
        resizeMode="contain"
        resizeMethod="scale"
        fadeDuration={0}
        shouldRasterizeIOS
        renderToHardwareTextureAndroid
      />
    </Animated.View>
  );
}

/**
 * Root Layout Component
 * Sets up the main navigation structure for the app
 * Handles authentication checks and deep link routing
 */
export default function RootLayout() {
  const [initialRoute, setInitialRoute] = useState<keyof RootStackParamList | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [isVerifyingMagicLink, setIsVerifyingMagicLink] = useState(false);
  const [expiredLinkParams, setExpiredLinkParams] = useState<{ email?: string; errorType?: 'expired' | 'invalid' | 'used' } | null>(null);
  const [pendingDeepLinkNav, setPendingDeepLinkNav] = useState<{
    screen: keyof RootStackParamList;
    params: Record<string, unknown>;
  } | null>(null);
  const [collectNameInitialParams, setCollectNameInitialParams] = useState<
    RootStackParamList['CollectName'] | undefined
  >(undefined);
  const [isExiting, setIsExiting] = useState(false);
  const [hasExited, setHasExited] = useState(false);
  const navigationRef = useRef<any>(null);

  const isLoading = isCheckingAuth || initialRoute === null || isVerifyingMagicLink;

  /**
   * Hide Login's underlying logo synchronously during the coordinated boot
   * transition so it does not visually overlap the moving overlay logo.
   * Runs during render (before children, including Login, mount) so Login's
   * first paint picks up opacity=0. The overlay animation later fades this
   * back to 1 once its logo has landed on top. Idempotent (safe on re-render).
   */
  if (initialRoute === 'Login' && !hasExited) {
    loginLogoOpacity.setValue(0);
  }

  /**
   * Trigger the splash → app zoom-in + fade-out transition as soon as all
   * loading work completes. The LoadingScreen overlay plays the animation
   * and calls back into `setHasExited` when the reveal is done.
   */
  useEffect(() => {
    if (!isLoading && !isExiting && !hasExited) {
      setIsExiting(true);
    }
  }, [isLoading, isExiting, hasExited]);

  useEffect(() => {
    // Check if user is already authenticated
    const checkAuth = async () => {
      try {
        const isAuthenticated = await AuthService.isAuthenticated();
        if (isAuthenticated) {
          const session = await AuthService.getSession();
          const decoded = session ? AuthService.decodeJWT(session.jwt) : null;
          if (decoded?.isBackdoor) {
            setCollectNameInitialParams(undefined);
            setInitialRoute('Home');
          } else {
            const profile = await AuthService.getMe();
            if (profile && AuthService.needsProfileName(profile)) {
              setCollectNameInitialParams(undefined);
              setInitialRoute('CollectName');
            } else {
              setCollectNameInitialParams(undefined);
              setInitialRoute('Home');
            }
          }
          // Log app launch
          await ActivityService.logActivity('app_launch', {
            source: 'cold_start',
          });
        } else {
          setInitialRoute('Login');
        }
      } catch (error) {
        console.error('Error checking authentication:', error);
        setInitialRoute('Login');
      } finally {
        setIsCheckingAuth(false);
      }
    };

    // Handle deep links
    const handleDeepLink = async (url: string) => {
      console.log('🔗 Deep link received:', url);
      
      const parsed = Linking.parse(url);
      console.log('📋 Parsed deep link:', JSON.stringify(parsed, null, 2));
      
      // Handle both bigbuys://auth?token=xxx and https://mobile.bigbuys.io/auth/verify?token=xxx
      let token: string | undefined;
      
      if (parsed.scheme === 'bigbuys' && parsed.hostname === 'auth') {
        // Custom URL scheme: bigbuys://auth?token=xxx
        token = parsed.queryParams?.token as string;
        console.log('✅ Parsed custom scheme token:', token ? 'found' : 'missing');
      } else if (parsed.hostname === 'mobile.bigbuys.io') {
        // Universal link: https://mobile.bigbuys.io/auth/verify?token=xxx
        // Path might be "auth/verify" or "/auth/verify" - both are valid
        const path = parsed.path || '';
        
        // Handle short URLs: /s/{shortId}
        if (path.startsWith('/s/') || path.startsWith('s/')) {
          const shortId = path.replace(/^\/?s\//, '');
          if (shortId) {
            console.log('🔗 Short URL detected, resolving:', shortId);
            try {
              // Resolve short URL by calling Lambda API
              const resolveUrl = `https://qx7x0uioo1.execute-api.us-west-2.amazonaws.com/v1/s/${shortId}?resolve=true`;
              console.log('📡 Resolving short URL:', resolveUrl);
              
              const resolveResponse = await fetch(resolveUrl, {
                method: 'GET',
                headers: {
                  'Content-Type': 'application/json',
                },
              });
              
              if (!resolveResponse.ok) {
                const errorData = await resolveResponse.json().catch(() => ({}));
                throw new Error(errorData.message || errorData.error || 'Failed to resolve short URL');
              }
              
              const resolveData = await resolveResponse.json();
              const fullUrl = resolveData.fullUrl;
              
              if (!fullUrl) {
                throw new Error('Invalid response from short URL resolver');
              }
              
              console.log('✅ Short URL resolved to:', fullUrl.substring(0, 100));
              
              // Recursively handle the resolved URL
              return handleDeepLink(fullUrl);
            } catch (error) {
              console.error('❌ Failed to resolve short URL:', error);
              // Show error screen
              setExpiredLinkParams({
                errorType: 'invalid',
                email: undefined,
              });
              setInitialRoute('ExpiredLink');
              setIsVerifyingMagicLink(false);
              return;
            }
          }
        }
        
        // Handle /auth/verify paths (existing logic)
        if (path.includes('auth/verify') || path === '' || parsed.queryParams?.token) {
          token = parsed.queryParams?.token as string;
          console.log('✅ Parsed universal link token:', token ? 'found' : 'missing', { path });
        }
      }

      if (token) {
        console.log('🔐 Verifying magic link token...');
        setIsVerifyingMagicLink(true);
        try {
          console.log('🔗 ===== DEEP LINK PARSING =====');
          console.log('🔗 Full parsed object:', JSON.stringify(parsed, null, 2));
          console.log('🔗 Query params object:', JSON.stringify(parsed.queryParams, null, 2));
          
          const app = parsed.queryParams?.app as string | undefined;
          const pageId = parsed.queryParams?.pageId as string | undefined;
          const variablesStr = parsed.queryParams?.variables as string | undefined;
          
          console.log('🔗 Extracted from query params:');
          console.log('🔗   app:', app);
          console.log('🔗   pageId:', pageId);
          console.log('🔗   variablesStr (raw):', variablesStr);
          console.log('🔗   variablesStr type:', typeof variablesStr);
          console.log('🔗   variablesStr length:', variablesStr?.length);
          
          // Parse variables JSON string if provided
          let variables: Record<string, string> | undefined;
          if (variablesStr) {
            try {
              const decoded = decodeURIComponent(variablesStr);
              console.log('🔗   variablesStr (decoded):', decoded);
              variables = JSON.parse(decoded);
              console.log('🔗   variables (parsed):', JSON.stringify(variables, null, 2));
            } catch (parseError) {
              console.error('⚠️ Failed to parse variables JSON:', parseError);
              console.error('⚠️   variablesStr that failed:', variablesStr);
            }
          } else {
            console.log('🔗   No variablesStr provided');
          }
          console.log('🔗 ===== END DEEP LINK PARSING =====');
          
          const session = await AuthService.verifyMagicLink(token);
          console.log('✅ Authentication successful!', { email: session.user.email });

          const decoded = AuthService.decodeJWT(session.jwt);
          const profileAfterVerify = await AuthService.getMe();
          const needsProfileName =
            !!profileAfterVerify &&
            AuthService.needsProfileName(profileAfterVerify) &&
            !decoded?.isBackdoor;

          // Map app query param to screen (My Apps / mybuys: slugs, built-in applets, or hardcoded fallbacks)
          let targetScreen: keyof RootStackParamList = 'Home';
          let screenParams: Record<string, unknown> = {};

          if (app) {
            if (app.startsWith('mybuys:')) {
              try {
                const userApplets = await MyBuysService.listApplets();
                const match = userApplets.find((a) => a.deepLinkSlug === app);
                if (match) {
                  targetScreen = 'ViewMyBuysApplet';
                  screenParams = {
                    appletId: match.appletId,
                    ...(pageId ? { pageId } : {}),
                    ...(variables && Object.keys(variables).length > 0 ? { variables } : {}),
                  };
                } else {
                  console.warn(`⚠️ No My Apps applet for deep link slug: ${app}`);
                  Toast.show({
                    type: 'error',
                    text1: 'Applet not found',
                    text2: 'Check your deep link key or open the applet from My Apps.',
                  });
                }
              } catch (e) {
                console.error('Failed to resolve My Apps deep link:', e);
                Toast.show({
                  type: 'error',
                  text1: 'Failed to load My Apps',
                  text2: 'Navigating to Home',
                });
              }
            } else {
              try {
                const applets = await listBuiltInApplets();
                const appNormalized = app.toLowerCase().replace(/-/g, '');
                const applet = applets.find(
                  (a) => a.app_name && a.app_name.toLowerCase().replace(/-/g, '') === appNormalized
                );

                if (applet) {
                  const ts = applet.target_screen;
                  targetScreen = (ts === 'conversationalai' ? 'ConversationalAI' : ts) as keyof RootStackParamList;
                  screenParams = {
                    appletId: applet.applet_id,
                    appletName: applet.name,
                    workbookId: applet.workbook_id ?? undefined,
                    slug: applet.slug,
                    embedPath: applet.embed_path,
                    name: applet.name,
                    pageId: pageId || applet.initial_page_id || undefined,
                    variables,
                  };
                } else {
                  const appLower = app.toLowerCase();
                  if (appLower === 'dashboard') {
                    targetScreen = 'Dashboard';
                  } else if (appLower === 'conversationalai' || appLower === 'conversational-ai') {
                    targetScreen = 'ConversationalAI';
                  } else if (appLower === 'operations') {
                    targetScreen = 'Operations';
                  } else {
                    console.warn(`⚠️ Unknown app name: ${app}, defaulting to Home`);
                  }
                  if (pageId) screenParams.pageId = pageId;
                  if (variables) screenParams.variables = variables;
                }
              } catch (fetchError) {
                console.error('Failed to fetch applets for deep link:', fetchError);
                Toast.show({
                  type: 'error',
                  text1: 'Failed to load app',
                  text2: 'Navigating to Home',
                });
              }
            }
          }

          if (needsProfileName) {
            setCollectNameInitialParams(
              targetScreen !== 'Home'
                ? {
                    pendingDeepLink: {
                      screen: targetScreen,
                      params: screenParams,
                    },
                  }
                : undefined
            );
            setInitialRoute('CollectName');
            setIsCheckingAuth(false);
            setPendingDeepLinkNav(null);
          } else {
            // ViewMyBuysApplet requires route.params (appletId) on first paint; mounting it as
            // initialRouteName leaves route.params undefined and crashes. Use Home first; onReady
            // applies pendingDeepLinkNav to navigate there with params.
            const initialRouteForStack =
              targetScreen === 'ViewMyBuysApplet' ? 'Home' : targetScreen;
            setCollectNameInitialParams(undefined);
            setInitialRoute(initialRouteForStack);
            setIsCheckingAuth(false);

            if (targetScreen !== 'Home') {
              setPendingDeepLinkNav({
                screen: targetScreen,
                params: screenParams,
              });
              console.log('🔗 Stored pending navigation:', { screen: targetScreen, params: screenParams });
            } else {
              setPendingDeepLinkNav(null);
            }

            /**
             * Defensive imperative nav: if the NavigationContainer is already
             * mounted (warm handler case: app was on Login, user tapped magic
             * link) the key={initialRoute} prop SHOULD force a remount onto
             * the new initialRouteName. If for any reason it doesn't (stale
             * nav state, Fast Refresh preserving state, etc.), this reset
             * guarantees the user lands on the target screen. Retries briefly
             * in case the ref isn't ready yet (mid-remount).
             *
             * IMPORTANT: only dispatch when we have a DEFINED current route
             * that differs from the target. If getCurrentRoute() returns
             * undefined (common during the container remount window), we keep
             * retrying instead of dispatching a reset. Dispatching reset when
             * the remount is already landing on Home causes Stack.Navigator
             * to play its default horizontal card transition, which bleeds
             * through the verifying overlay's fade-out as a visible swipe.
             */
            const targetRouteName = initialRouteForStack;
            const attemptReset = (attemptsLeft: number) => {
              const nav = navigationRef.current;
              const isReady = !!(nav && nav.isReady && nav.isReady());
              const currentRoute = isReady ? nav.getCurrentRoute?.() : undefined;

              if (currentRoute) {
                if (currentRoute.name !== targetRouteName) {
                  console.log(
                    `🔗 Imperative nav reset to ${targetRouteName} (was: ${currentRoute.name})`
                  );
                  nav.dispatch(
                    CommonActions.reset({
                      index: 0,
                      routes: [{ name: targetRouteName }],
                    })
                  );
                }
                // else: remount already landed on target, nothing to do.
              } else if (attemptsLeft > 0) {
                setTimeout(() => attemptReset(attemptsLeft - 1), 50);
              }
            };
            setTimeout(() => attemptReset(20), 50);
          }

          // Log app launch (from deep link)
          await ActivityService.logActivity('app_launch', {
            source: 'deep_link',
            app: app || null,
          });
          
          setIsVerifyingMagicLink(false);
        } catch (error: any) {
          // Only log as error if it's not a token expiration (which is expected)
          if (!error.isTokenExpired) {
            console.error('❌ Deep link auth error:', error);
          } else {
            console.log('🔗 Token expired/invalid (expected):', error.message);
          }
          const errorMessage = error instanceof Error ? error.message : 'Authentication failed';
          
          // Handle token expiration/invalid errors - navigate to ExpiredLink screen
          if (error.isTokenExpired) {
            // Don't log as error to avoid error toast - this is expected behavior
            console.log('🔗 Token expired/invalid, navigating to ExpiredLink screen');
            setIsCheckingAuth(false);
            
            // Store params for ExpiredLink screen - this will be used as initialParams
            const paramsToStore = {
              errorType: error.errorType || 'invalid',
              email: error.email,
            };
            setExpiredLinkParams(paramsToStore);
            
            console.log('📧 Email from error:', error.email, 'Error type:', error.errorType);
            
            // Set initialRoute to ExpiredLink so NavigationContainer can render
            // The expiredLinkParams state will be used as initialParams
            setInitialRoute('ExpiredLink');
            
            // Hide loading screen so NavigationContainer can render
            // The component will receive params via initialParams
            setIsVerifyingMagicLink(false);
          } 
          // Handle account expiration errors
          else if (error.isExpirationError) {
            Alert.alert(
              'Account Expired',
              errorMessage,
              [
                {
                  text: 'OK',
                  onPress: () => {
                    if (isCheckingAuth) {
                      setInitialRoute('Login');
                      setIsCheckingAuth(false);
                    }
                  },
                },
              ]
            );
          } else {
            // For other errors, navigate to ExpiredLink with generic error
            // Don't log as error to avoid error toast - log as warning instead
            console.warn('⚠️ Deep link error (non-token):', errorMessage);
            setIsCheckingAuth(false);
            // Keep isVerifyingMagicLink true to show loading screen until navigation completes
            
            // Store params for ExpiredLink screen
            setExpiredLinkParams({
              errorType: 'invalid',
              email: error.email,
            });
            
            // Navigate to ExpiredLink screen
            // Use reset() to navigate - this ensures clean navigation stack with params
            let retryCount = 0;
            const maxRetries = 10;
            
            const navigateToExpiredLink = () => {
              if (navigationRef.current) {
                try {
                  navigationRef.current.reset({
                    index: 0,
                    routes: [{ 
                      name: 'ExpiredLink',
                      params: {
                        errorType: 'invalid',
                        email: error.email,
                      }
                    }],
                  });
                  console.log('✅ Navigated to ExpiredLink screen with email:', error.email);
                  // Hide loading screen after successful navigation
                  setIsVerifyingMagicLink(false);
                } catch (navError) {
                  console.warn('Navigation error (will retry):', navError);
                  if (retryCount < maxRetries) {
                    retryCount++;
                    setTimeout(navigateToExpiredLink, 200);
                  } else {
                    // Fallback: navigation failed, hide loading screen and set initial route
                    setInitialRoute('ExpiredLink');
                    setIsVerifyingMagicLink(false);
                  }
                }
              } else {
                if (retryCount < maxRetries) {
                  retryCount++;
                  setTimeout(navigateToExpiredLink, 200);
                } else {
                  // Fallback: navigation ref never became available, set initial route
                  setInitialRoute('ExpiredLink');
                  setIsVerifyingMagicLink(false);
                }
              }
            };
            
            setTimeout(navigateToExpiredLink, 300);
          }
        }
      } else {
        console.warn('⚠️ No token found in deep link');
      }
    };

    /**
     * Bootstrap auth + initial deep link handling in a deterministic order.
     *
     * Why not run them in parallel fire-and-forget (previous behavior): when
     * `NavigationContainer` mounts eagerly (required for the splash → Login
     * coordinated logo animation), React Navigation locks in whatever
     * `initialRouteName` the `initialRoute` state holds at first mount. If
     * `checkAuth` wins the race and sets `initialRoute='Login'` before the
     * magic-link deep link is verified, the subsequent `setInitialRoute('Home')`
     * from the deep link success path becomes a no-op — the user is stuck on
     * Login after tapping the magic link. Pre-setting `isVerifyingMagicLink`
     * keeps `isLoading` true (splash visible, but see note below about the
     * remount fallback), and the `key={initialRoute}` prop on the navigator
     * guarantees a remount if the route does change post-mount.
     */
    const bootstrap = async () => {
      try {
        const initialUrl = await Linking.getInitialURL();

        if (initialUrl) {
          // Hold the splash so the race above can't lock in initialRouteName.
          setIsVerifyingMagicLink(true);
        }

        await Promise.all([
          checkAuth(),
          initialUrl
            ? handleDeepLink(initialUrl).finally(() => {
                // Covers the "URL but no token" path, where handleDeepLink
                // returns without touching isVerifyingMagicLink.
                setIsVerifyingMagicLink(false);
              })
            : Promise.resolve(),
        ]);
      } catch (err) {
        console.error('Bootstrap error:', err);
        setIsVerifyingMagicLink(false);
      }
    };

    bootstrap();

    // Listen for deep links while app is running
    const subscription = Linking.addEventListener('url', (event) => {
      handleDeepLink(event.url);
    });

    return () => {
      subscription.remove();
    };
  }, []);

  return (
    <View style={styles.rootContainer}>
      {initialRoute !== null && (
        <NavigationContainer
          /**
           * Keying on initialRoute forces a fresh navigator mount when the
           * route is changed after the container has already mounted — most
           * importantly, when a deep-linked magic-link verify finishes AFTER
           * checkAuth has already set initialRoute='Login'. Without this,
           * React Navigation ignores the prop change (initialRouteName is
           * mount-time only) and the user is stranded on Login. onReady
           * re-fires on the new container, which also re-runs pendingDeepLinkNav.
           */
          key={initialRoute}
          ref={navigationRef}
      onReady={() => {
        // Once navigation is ready, navigate with params if we have pending deep link navigation
        if (pendingDeepLinkNav) {
          const nav = navigationRef.current;
          if (nav) {
            console.log('🔗 Navigation container ready, executing pending navigation:', pendingDeepLinkNav);
            // Use navigate instead of reset to avoid header styling issues
            // First navigate to Home, then to the target screen
            nav.dispatch(
              CommonActions.reset({
                index: 0,
                routes: [{ name: 'Home' }],
              })
            );
            
            // Then navigate to the target screen after a brief delay
            // This ensures the header style is applied correctly
            setTimeout(() => {
              if (nav) {
                nav.navigate(pendingDeepLinkNav.screen as never, pendingDeepLinkNav.params as never);
              }
            }, 100);
            console.log(`✅ Navigated to ${pendingDeepLinkNav.screen} with params via onReady`);
            console.log('🔗 Params passed:', JSON.stringify(pendingDeepLinkNav.params, null, 2));
            // Clear pending navigation
            setPendingDeepLinkNav(null);
          }
        }
      }}
    >
      <StatusBar style="light" />
      <Stack.Navigator
        initialRouteName={initialRoute}
        screenOptions={{
          headerStyle: {
            backgroundColor: colors.primary,
            elevation: 0,
            shadowOpacity: 0,
            borderBottomWidth: 0,
            opacity: 1,
          },
          headerTintColor: colors.background,
          headerTitleStyle: {
            fontWeight: 'bold',
          },
          headerTransparent: false,
          /**
           * Global default interpolator: opacity-only, no translate. Held
           * below any per-screen override (magic-link forNoAnimation,
           * per-hero scale-from-rect). Ensures source screens (Home, Apps,
           * Dashboards, etc.) do NOT slide off horizontally when a hero
           * destination is pushed on top — the previous screen stays put
           * while the destination grows over it.
           */
          cardStyleInterpolator: heroDefaultCardStyleInterpolator,
          cardOverlayEnabled: false,
          cardShadowEnabled: false,
          /**
           * During magic-link verification, force the card interpolator to
           * forNoAnimation so any card transition that fires inside the verify
           * window (e.g., the defensive imperative reset dispatching a
           * CommonActions.reset, or the navigator mounting into a mid-flight
           * state after the `key={initialRoute}` remount) is instant instead
           * of the default iOS horizontal slide. The slide would otherwise
           * bleed through the MagicLinkVerifyingOverlay's fade-out as a
           * visible "swipe into Home". Cleared automatically when
           * setIsVerifyingMagicLink(false) fires, restoring normal in-app
           * navigation transitions.
           */
          ...(isVerifyingMagicLink && {
            cardStyleInterpolator: CardStyleInterpolators.forNoAnimation,
          }),
        }}
      >
        <Stack.Screen 
          name="Login" 
          component={Login}
          options={{
            title: 'Login',
            headerShown: false, // Full-screen branded login experience
          }}
        />
        <Stack.Screen 
          name="ExpiredLink" 
          component={ExpiredLink}
          initialParams={expiredLinkParams || undefined}
          options={{
            title: 'Link Expired',
            headerShown: false, // Full-screen branded experience
          }}
        />
        <Stack.Screen
          name="CollectName"
          component={CollectName}
          initialParams={collectNameInitialParams}
          options={{
            title: 'Your name',
            headerShown: false,
          }}
        />
        <Stack.Screen 
          name="Home" 
          component={Home}
          options={{
            title: 'Home',
            headerShown: false, // Hide header for cleaner home page
          }}
        />
        <Stack.Screen 
          name="Dashboard" 
          component={Dashboard}
          options={{
            ...heroDestinationScreenOptions('Dashboard'),
            title: 'Dashboard',
            headerShown: true,
            headerStyle: {
              backgroundColor: colors.primary,
              elevation: 0,
              shadowOpacity: 0,
              borderBottomWidth: 0,
            },
            headerTintColor: colors.background,
            headerTitleStyle: {
              fontWeight: 'bold',
            },
            headerTransparent: false,
          }}
        />
        <Stack.Screen 
          name="ConversationalAI" 
          component={ConversationalAI}
          options={{
            ...heroDestinationScreenOptions('ConversationalAI'),
            title: 'AI Query',
            headerShown: true,
            headerStyle: {
              backgroundColor: colors.primary,
              elevation: 0,
              shadowOpacity: 0,
              borderBottomWidth: 0,
            },
            headerTintColor: colors.background,
            headerTitleStyle: {
              fontWeight: 'bold',
            },
            headerTransparent: false,
          }}
        />
        <Stack.Screen 
          name="Operations" 
          component={Operations}
          options={{
            ...heroDestinationScreenOptions('Operations'),
            title: 'Operations',
            headerShown: true,
          }}
        />
        <Stack.Screen 
          name="GenericAppletView" 
          component={GenericAppletView}
          options={({ route }) => ({
            ...heroDestinationScreenOptions('GenericAppletView'),
            title: (route.params as { name?: string })?.name || 'Applet',
            headerShown: true,
            headerStyle: {
              backgroundColor: colors.primary,
              elevation: 0,
              shadowOpacity: 0,
              borderBottomWidth: 0,
            },
            headerTintColor: colors.background,
            headerTitleStyle: {
              fontWeight: 'bold',
            },
            headerTransparent: false,
          })}
        />
        <Stack.Screen 
          name="Admin" 
          component={Admin}
          options={{
            title: 'Admin',
            headerShown: true,
          }}
        />
        <Stack.Screen 
          name="ActivityLog" 
          component={ActivityLog}
          options={{
            title: 'Activity Log',
            headerShown: true,
          }}
        />
        <Stack.Screen 
          name="EditUser" 
          component={EditUser}
          options={{
            title: 'Edit User',
            headerShown: true,
          }}
        />
        <Stack.Screen 
          name="AddWhitelistUser" 
          component={AddWhitelistUser}
          options={{
            title: 'Add Whitelist User',
            headerShown: true,
          }}
        />
        <Stack.Screen 
          name="MyBuys" 
          component={MyBuys}
          options={{
            ...heroDestinationScreenOptions('MyBuys'),
            title: 'My Apps',
            headerShown: true,
            headerStyle: {
              backgroundColor: colors.background,
              elevation: 0,
              shadowOpacity: 0,
              borderBottomWidth: 1,
              borderBottomColor: colors.border,
            },
            headerTintColor: colors.textPrimary,
            headerTitleStyle: {
              fontWeight: 'bold',
              color: colors.textPrimary,
            },
            headerTransparent: false,
          }}
        />
        <Stack.Screen
          name="AddMyBuysApplet"
          component={AddMyBuysApplet}
          options={myBuysAppletModalScreenOptions('Add Applet')}
        />
        <Stack.Screen
          name="EditMyBuysApplet"
          component={EditMyBuysApplet}
          options={myBuysAppletModalScreenOptions('Edit Applet')}
        />
        <Stack.Screen 
          name="ViewMyBuysApplet" 
          component={ViewMyBuysApplet}
          options={{
            ...heroDestinationScreenOptions('ViewMyBuysApplet'),
            title: '', // Title will be set by component once applet name loads
            headerShown: true,
          }}
        />
        <Stack.Screen 
          name="Sigmanauts" 
          component={Sigmanauts}
          options={{
            ...heroDestinationScreenOptions('Sigmanauts'),
            title: 'Sigmanauts',
            headerShown: true,
            headerStyle: {
              backgroundColor: colors.background,
              elevation: 0,
              shadowOpacity: 0,
              borderBottomWidth: 1,
              borderBottomColor: colors.border,
            },
            headerTintColor: colors.textPrimary,
            headerTitleStyle: {
              fontWeight: 'bold',
              color: colors.textPrimary,
            },
            headerTransparent: false,
          }}
        />
        <Stack.Screen 
          name="AI" 
          component={AI}
          options={{
            ...heroDestinationScreenOptions('AI'),
            title: 'AI',
            headerShown: true,
            headerStyle: {
              backgroundColor: colors.background,
              elevation: 0,
              shadowOpacity: 0,
              borderBottomWidth: 1,
              borderBottomColor: colors.border,
            },
            headerTintColor: colors.textPrimary,
            headerTitleStyle: {
              fontWeight: 'bold',
              color: colors.textPrimary,
            },
            headerTransparent: false,
          }}
        />
        <Stack.Screen 
          name="Dashboards" 
          component={Dashboards}
          options={{
            ...heroDestinationScreenOptions('Dashboards'),
            title: 'Dashboards',
            headerShown: true,
            headerStyle: {
              backgroundColor: colors.background,
              elevation: 0,
              shadowOpacity: 0,
              borderBottomWidth: 1,
              borderBottomColor: colors.border,
            },
            headerTintColor: colors.textPrimary,
            headerTitleStyle: {
              fontWeight: 'bold',
              color: colors.textPrimary,
            },
            headerTransparent: false,
          }}
        />
        <Stack.Screen 
          name="Apps" 
          component={Apps}
          options={{
            ...heroDestinationScreenOptions('Apps'),
            title: 'Apps',
            headerShown: true,
            headerStyle: {
              backgroundColor: colors.background,
              elevation: 0,
              shadowOpacity: 0,
              borderBottomWidth: 1,
              borderBottomColor: colors.border,
            },
            headerTintColor: colors.textPrimary,
            headerTitleStyle: {
              fontWeight: 'bold',
              color: colors.textPrimary,
            },
            headerTransparent: false,
          }}
        />
        <Stack.Screen
          name="PhoneVerification"
          component={PhoneVerification}
          options={{
            title: 'Phone Verification',
            headerShown: true,
            headerStyle: {
              backgroundColor: colors.primary,
              elevation: 0,
              shadowOpacity: 0,
              borderBottomWidth: 0,
            },
            headerTintColor: colors.background,
            headerTitleStyle: { fontWeight: 'bold' },
            headerTransparent: false,
          }}
        />
      </Stack.Navigator>
      <Toast />
    </NavigationContainer>
      )}
      {!hasExited && (
        <LoadingScreen
          shouldExit={isExiting}
          onExitComplete={() => setHasExited(true)}
          coordinateWithLoginLogo={initialRoute === 'Login'}
        />
      )}
      {hasExited && (
        <MagicLinkVerifyingOverlay visible={isVerifyingMagicLink} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  rootContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  /**
   * Absolute-fill overlay that mirrors the native splash (same image, same
   * white background from app.json). It sits on top of the navigator and
   * fades/zooms out to reveal the first screen beneath.
   */
  loadingContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingBackground: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#FFFFFF',
  },
  zetaIcon: {
    width: 310,
    height: 310,
  },
});
