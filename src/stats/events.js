// @flow
import _ from 'lodash';
import SlippiGame from "../index";
import type { PostFrameUpdateType } from "../utils/slpReader";
import type { FrameEntryType } from "../index";

type PlayerIndexedType = {
  playerIndex: number,
  opponentIndex: number
}

export type DurationType = {
  startFrame: number,
  endFrame: ?number
}

export type DamageType = {
  startPercent: number,
  endPercent: ?number
}

export type StockType = PlayerIndexedType & DurationType & DamageType & {
  moveKilledBy: ?number,
  deathAnimation: ?number
};

export type ComboStringType = PlayerIndexedType & DurationType & DamageType & {
  hitCount: number
}

export type PunishType = ComboStringType & {
  didKill: boolean
}

export type EdgeguardType = PunishType;

export const States = {
  // Animation ID ranges
  DAMAGE_START: 0x4B,
  DAMAGE_END: 0x5B,
  CAPTURE_START: 0xDF,
  CAPTURE_END: 0xE8,
  GUARD_START: 0xB2,
  GUARD_END: 0xB6,
  GROUNDED_CONTROL_START: 0xE,
  GROUNDED_CONTROL_END: 0x18,
  TECH_START: 0xC7,
  TECH_END: 0xCC,
  DYING_START: 0x0,
  DYING_END: 0xA,

  // Animation ID specific
  ROLL_FORWARD: 0xE9,
  ROLL_BACKWARD: 0xEA,
  SPOT_DODGE: 0xEB,
  AIR_DODGE: 0xEC,
  ACTION_WAIT: 0xE,
  ACTION_DASH: 0x14,
  ACTION_KNEE_BEND: 0x18,
  GUARD_ON: 0xB2,
  TECH_MISS_UP: 0xB7,
  TECH_MISS_DOWN: 0xBF
};

const Timers = {
  PUNISH_RESET_FRAMES: 45,
  RECOVERY_RESET_FRAMES: 45,
  COMBO_STRING_RESET_FRAMES: 45
};

function getSinglesOpponentIndices(game: SlippiGame): PlayerIndexedType[] {
  const settings = game.getSettings();
  if (settings.players.length !== 2) {
    // Only return opponent indices for singles
    return [];
  }

  return [
    {
      playerIndex: settings.players[0].playerIndex,
      opponentIndex: settings.players[1].playerIndex
    }, {
      playerIndex: settings.players[1].playerIndex,
      opponentIndex: settings.players[0].playerIndex
    }
  ];
}

function didLoseStock(frame: PostFrameUpdateType, prevFrame: PostFrameUpdateType): boolean {
  if (!frame || !prevFrame) {
    return false;
  }

  return (prevFrame.stocksRemaining - frame.stocksRemaining) > 0;
}

function isInControl(state: number): boolean {
  return state >= States.GROUNDED_CONTROL_START && state <= States.GROUNDED_CONTROL_END;
}

function isDamaged(state: number): boolean {
  return state >= States.DAMAGE_START && state <= States.DAMAGE_END;
}

function isGrabbed(state: number): boolean {
  return state >= States.CAPTURE_START && state <= States.CAPTURE_END;
}

function isDead(state: number): boolean {
  return state >= States.DYING_START && state <= States.DYING_END;
}

function calcDamageTaken(frame: PostFrameUpdateType, prevFrame: PostFrameUpdateType): number {
  const percent = _.get(frame, 'percent', 0);
  const prevPercent = _.get(prevFrame, 'percent', 0);

  return percent - prevPercent;
}

function getSortedFrames(game: SlippiGame) {
  // TODO: This is obviously jank and probably shouldn't be done this way. I just didn't
  // TODO: want the primary game object to have the concept of sortedFrames because it's
  // TODO: kinda shitty I need to do that anyway. It's required because javascript doesn't
  // TODO: support sorted objects... I could use a Map but that felt pretty heavy for
  // TODO: little reason.
  if (_.has(game, ['external', 'sortedFrames'])) {
    // $FlowFixMe
    return game.external.sortedFrames;
  }

  const frames = game.getFrames();
  const sortedFrames = _.orderBy(frames, 'frame');
  _.set(game, ['external', 'sortedFrames'], sortedFrames);

  // $FlowFixMe
  return game.external.sortedFrames;
}

function iterateFramesInOrder(
  game: SlippiGame,
  initialize: (indices: PlayerIndexedType) => void,
  processFrame: (indices: PlayerIndexedType, frame: FrameEntryType) => void
) {
  const opponentIndices = getSinglesOpponentIndices(game);
  if (opponentIndices.length === 0) {
    return;
  }

  const sortedFrames = getSortedFrames(game);

  // Iterates through both of the player/opponent pairs
  _.forEach(opponentIndices, (indices) => {
    initialize(indices);

    // Iterates through all of the frames for the current player and opponent
    _.forEach(sortedFrames, (frame) => {
      processFrame(indices, frame);
    });
  });
}

export function getLastFrame(game: SlippiGame): number {
  const sortedFrames = getSortedFrames(game);
  const lastFrame = _.last(sortedFrames);

  return lastFrame.frame;
}

export function generateStocks(game: SlippiGame): StockType[] {
  const stocks = [];
  const frames = game.getFrames();

  const initialState: {
    stock: ?StockType
  } = {
    stock: null
  };

  let state = initialState;

  // Iterates the frames in order in order to compute stocks
  iterateFramesInOrder(game, () => {
    state = { ...initialState };
  }, (indices, frame) => {
    const playerFrame = frame.players[indices.playerIndex].post;
    const prevPlayerFrame: PostFrameUpdateType = _.get(
      frames, [playerFrame.frame - 1, 'players', indices.playerIndex, 'post'], {}
    );

    const opponentFrame = frame.players[indices.opponentIndex].post;

    // If there is currently no active stock, wait until the player is no longer spawning.
    // Once the player is no longer spawning, start the stock
    if (!state.stock) {
      const isPlayerDead = isDead(playerFrame.actionStateId);
      if (isPlayerDead) {
        return;
      }

      state.stock = {
        playerIndex: indices.playerIndex,
        opponentIndex: indices.opponentIndex,
        startFrame: playerFrame.frame,
        endFrame: null,
        startPercent: 0,
        endPercent: null,
        moveKilledBy: null,
        deathAnimation: null,
      };

      stocks.push(state.stock);
    } else if (didLoseStock(playerFrame, prevPlayerFrame)) {
      state.stock.endFrame = playerFrame.frame;
      state.stock.endPercent = prevPlayerFrame.percent || 0;
      state.stock.moveKilledBy = opponentFrame.lastAttackLanded;
      state.stock.deathAnimation = playerFrame.actionStateId;
      state.stock = null;
    }
  });

  return stocks;
}

export function generatePunishes(game: SlippiGame): PunishType[] {
  // TODO: Perhaps call punishes "conversions"?
  const punishes = [];
  const frames = game.getFrames();

  const initialState: {
    punish: ?PunishType,
    resetCounter: number,
    count: number
  } = {
    punish: null,
    resetCounter: 0,
    count: 0
  };

  // Only really doing assignment here for flow
  let state = initialState;

  // Iterates the frames in order in order to compute punishes
  iterateFramesInOrder(game, () => {
    state = { ...initialState };
  }, (indices, frame) => {
    const playerFrame: PostFrameUpdateType = frame.players[indices.playerIndex].post;
    const opponentFrame: PostFrameUpdateType = frame.players[indices.opponentIndex].post;
    const prevOpponentFrame: PostFrameUpdateType = _.get(
      frames, [playerFrame.frame - 1, 'players', indices.opponentIndex, 'post'], {}
    );

    const opntIsDamaged = isDamaged(opponentFrame.actionStateId);
    const opntIsGrabbed = isGrabbed(opponentFrame.actionStateId);
    const opntDamageTaken = calcDamageTaken(opponentFrame, prevOpponentFrame);

    // If opponent took damage and was put in some kind of stun this frame, either
    // start a punish or
    if (opntDamageTaken && (opntIsDamaged || opntIsGrabbed)) {
      if (!state.punish) {
        state.punish = {
          playerIndex: indices.playerIndex,
          opponentIndex: indices.opponentIndex,
          startFrame: playerFrame.frame,
          endFrame: null,
          startPercent: prevOpponentFrame.percent || 0,
          endPercent: null,
          hitCount: 0,
          didKill: false,
        };

        punishes.push(state.punish);
      }

      state.punish.hitCount += 1;
    }

    state.count += 1;

    if (!state.punish) {
      // The rest of the function handles punish termination logic, so if we don't
      // have a punish started, there is no need to continue
      return;
    }

    const opntInControl = isInControl(opponentFrame.actionStateId);
    const opntDidLoseStock = didLoseStock(opponentFrame, prevOpponentFrame);

    if (opntIsDamaged || opntIsGrabbed) {
      // If opponent got grabbed or damaged, reset the reset counter
      state.resetCounter = 0;
    }

    const shouldStartResetCounter = state.resetCounter === 0 && opntInControl;
    const shouldContinueResetCounter = state.resetCounter > 0;
    if (shouldStartResetCounter || shouldContinueResetCounter) {
      // This will increment the reset timer under the following conditions:
      // 1) if we were punishing opponent but they have now entered an actionable state
      // 2) if counter has already started counting meaning opponent has entered actionable state
      state.resetCounter += 1;
    }

    let shouldTerminate = false;

    // Termination condition 1 - player kills opponent
    if (opntDidLoseStock) {
      state.punish.didKill = true;
      shouldTerminate = true;
    }

    // Termination condition 2 - punish resets on time
    if (state.resetCounter > Timers.PUNISH_RESET_FRAMES) {
      shouldTerminate = true;
    }

    // If punish should terminate, mark the end states and add it to list
    if (shouldTerminate) {
      state.punish.endFrame = playerFrame.frame;
      state.punish.endPercent = prevOpponentFrame.percent || 0;

      state.punish = null;
    }
  });

  return punishes;
}
