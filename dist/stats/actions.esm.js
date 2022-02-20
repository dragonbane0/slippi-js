import { isEqual, last, keyBy, size, get, set } from "lodash-es";
import { getSinglesPlayerPermutationsFromSettings, State } from "./common.esm.js";

const dashDanceAnimations = [State.DASH, State.TURN, State.DASH];
class ActionsComputer {
  constructor() {
    this.playerPermutations = new Array();
    this.state = new Map();
  }

  setup(settings) {
    this.state = new Map();
    this.playerPermutations = getSinglesPlayerPermutationsFromSettings(settings);
    this.playerPermutations.forEach((indices) => {
      const playerCounts = {
        playerIndex: indices.playerIndex,
        wavedashCount: 0,
        wavelandCount: 0,
        airDodgeCount: 0,
        dashDanceCount: 0,
        spotDodgeCount: 0,
        ledgegrabCount: 0,
        rollCount: 0,
        lCancelCount: {
          success: 0,
          fail: 0,
        },
        grabCount: {
          success: 0,
          fail: 0,
        },
        throwCount: {
          up: 0,
          forward: 0,
          back: 0,
          down: 0,
        },
        groundTechCount: {
          // tech away/in are in reference to the opponents position and not the stage
          away: 0,
          in: 0,
          neutral: 0,
          fail: 0,
        },
        wallTechCount: {
          success: 0,
          fail: 0,
        },
      };
      const playerState = {
        playerCounts: playerCounts,
        animations: [],
      };
      this.state.set(indices, playerState);
    });
  }

  processFrame(frame) {
    this.playerPermutations.forEach((indices) => {
      const state = this.state.get(indices);

      if (state) {
        handleActionCompute(state, indices, frame);
      }
    });
  }

  fetch() {
    return Array.from(this.state.values()).map((val) => val.playerCounts);
  }
}

function didMissGroundTech(animation) {
  return animation === State.TECH_MISS_DOWN || animation === State.TECH_MISS_UP;
}

function isRolling(animation) {
  return animation === State.ROLL_BACKWARD || animation === State.ROLL_FORWARD;
}

function didStartRoll(currentAnimation, previousAnimation) {
  const isCurrentlyRolling = isRolling(currentAnimation);
  const wasPreviouslyRolling = isRolling(previousAnimation);
  return isCurrentlyRolling && !wasPreviouslyRolling;
}

function isSpotDodging(animation) {
  return animation === State.SPOT_DODGE;
}

function didStartGrabSuccess(currentAnimation, previousAnimation) {
  return previousAnimation === State.GRAB && currentAnimation <= State.GRAB_WAIT && currentAnimation > State.GRAB;
}

function didStartGrabFail(currentAnimation, previousAnimation) {
  return previousAnimation === State.GRAB && (currentAnimation > State.GRAB_WAIT || currentAnimation < State.GRAB);
}

function didStartSpotDodge(currentAnimation, previousAnimation) {
  const isCurrentlyDodging = isSpotDodging(currentAnimation);
  const wasPreviouslyDodging = isSpotDodging(previousAnimation);
  return isCurrentlyDodging && !wasPreviouslyDodging;
}

function isAirDodging(animation) {
  return animation === State.AIR_DODGE;
}

function didStartAirDodge(currentAnimation, previousAnimation) {
  const isCurrentlyDodging = isAirDodging(currentAnimation);
  const wasPreviouslyDodging = isAirDodging(previousAnimation);
  return isCurrentlyDodging && !wasPreviouslyDodging;
}

function isGrabbingLedge(animation) {
  return animation === State.CLIFF_CATCH;
}

function isAerialAttack(animation) {
  return animation >= State.AERIAL_ATTACK_START && animation <= State.AERIAL_ATTACK_END;
}

function didStartLedgegrab(currentAnimation, previousAnimation) {
  const isCurrentlyGrabbingLedge = isGrabbingLedge(currentAnimation);
  const wasPreviouslyGrabbingLedge = isGrabbingLedge(previousAnimation);
  return isCurrentlyGrabbingLedge && !wasPreviouslyGrabbingLedge;
}

function handleActionCompute(state, indices, frame) {
  const playerFrame = frame.players[indices.playerIndex].post;
  const opponentFrame = frame.players[indices.opponentIndex].post;

  const incrementCount = (field, condition) => {
    if (!condition) {
      return;
    }

    const current = get(state.playerCounts, field, 0);
    set(state.playerCounts, field, current + 1);
  }; // Manage animation state

  const currentAnimation = playerFrame.actionStateId;
  state.animations.push(currentAnimation); // Grab last 3 frames

  const last3Frames = state.animations.slice(-3);
  const prevAnimation = last3Frames[last3Frames.length - 2];
  const newAnimation = currentAnimation !== prevAnimation; // Increment counts based on conditions

  const didDashDance = isEqual(last3Frames, dashDanceAnimations);
  incrementCount("dashDanceCount", didDashDance);
  const didRoll = didStartRoll(currentAnimation, prevAnimation);
  incrementCount("rollCount", didRoll);
  const didSpotDodge = didStartSpotDodge(currentAnimation, prevAnimation);
  incrementCount("spotDodgeCount", didSpotDodge);
  const didAirDodge = didStartAirDodge(currentAnimation, prevAnimation);
  incrementCount("airDodgeCount", didAirDodge);
  const didGrabLedge = didStartLedgegrab(currentAnimation, prevAnimation);
  incrementCount("ledgegrabCount", didGrabLedge);
  const didGrabSucceed = didStartGrabSuccess(currentAnimation, prevAnimation);
  incrementCount("grabCount.success", didGrabSucceed);
  const didGrabFail = didStartGrabFail(currentAnimation, prevAnimation);
  incrementCount("grabCount.fail", didGrabFail);
  incrementCount("throwCount.up", currentAnimation === State.THROW_UP && newAnimation);
  incrementCount("throwCount.forward", currentAnimation === State.THROW_FORWARD && newAnimation);
  incrementCount("throwCount.down", currentAnimation === State.THROW_DOWN && newAnimation);
  incrementCount("throwCount.back", currentAnimation === State.THROW_BACK && newAnimation);

  if (newAnimation) {
    const didMissTech = didMissGroundTech(currentAnimation);
    incrementCount("groundTechCount.fail", didMissTech);
    let opponentDir = 1;
    let facingOpponent = false;

    if (playerFrame.positionX > opponentFrame.positionX) {
      opponentDir = -1;
    }

    if (playerFrame.facingDirection == opponentDir) {
      facingOpponent = true;
    }

    incrementCount("groundTechCount.in", currentAnimation === State.FORWARD_TECH && facingOpponent);
    incrementCount("groundTechCount.in", currentAnimation === State.BACKWARD_TECH && !facingOpponent);
    incrementCount("groundTechCount.neutral", currentAnimation === State.NEUTRAL_TECH);
    incrementCount("groundTechCount.away", currentAnimation === State.BACKWARD_TECH && facingOpponent);
    incrementCount("groundTechCount.away", currentAnimation === State.FORWARD_TECH && !facingOpponent);
    incrementCount("wallTechCount.success", currentAnimation === State.WALL_TECH);
    incrementCount("wallTechCount.fail", currentAnimation === State.MISSED_WALL_TECH);
  }

  if (isAerialAttack(currentAnimation)) {
    incrementCount("lCancelCount.success", playerFrame.lCancelStatus === 1);
    incrementCount("lCancelCount.fail", playerFrame.lCancelStatus === 2);
  } // Handles wavedash detection (and waveland)

  handleActionWavedash(state.playerCounts, state.animations);
}

function handleActionWavedash(counts, animations) {
  const currentAnimation = last(animations);
  const prevAnimation = animations[animations.length - 2];
  const isSpecialLanding = currentAnimation === State.LANDING_FALL_SPECIAL;
  const isAcceptablePrevious = isWavedashInitiationAnimation(prevAnimation);
  const isPossibleWavedash = isSpecialLanding && isAcceptablePrevious;

  if (!isPossibleWavedash) {
    return;
  } // Here we special landed, it might be a wavedash, let's check
  // We grab the last 8 frames here because that should be enough time to execute a
  // wavedash. This number could be tweaked if we find false negatives

  const recentFrames = animations.slice(-8);
  const recentAnimations = keyBy(recentFrames, (animation) => animation);

  if (size(recentAnimations) === 2 && recentAnimations[State.AIR_DODGE]) {
    // If the only other animation is air dodge, this might be really late to the point
    // where it was actually an air dodge. Air dodge animation is really long
    return;
  }

  if (recentAnimations[State.AIR_DODGE]) {
    // If one of the recent animations was an air dodge, let's remove that from the
    // air dodge counter, we don't want to count air dodges used to wavedash/land
    counts.airDodgeCount -= 1;
  }

  if (recentAnimations[State.ACTION_KNEE_BEND]) {
    // If a jump was started recently, we will consider this a wavedash
    counts.wavedashCount += 1;
  } else {
    // If there was no jump recently, this is a waveland
    counts.wavelandCount += 1;
  }
}

function isWavedashInitiationAnimation(animation) {
  if (animation === State.AIR_DODGE) {
    return true;
  }

  const isAboveMin = animation >= State.CONTROLLED_JUMP_START;
  const isBelowMax = animation <= State.CONTROLLED_JUMP_END;
  return isAboveMin && isBelowMax;
}

export { ActionsComputer };
//# sourceMappingURL=actions.esm.js.map
