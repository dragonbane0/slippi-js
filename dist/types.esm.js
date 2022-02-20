var Command;

(function (Command) {
  Command[(Command["MESSAGE_SIZES"] = 53)] = "MESSAGE_SIZES";
  Command[(Command["GAME_START"] = 54)] = "GAME_START";
  Command[(Command["PRE_FRAME_UPDATE"] = 55)] = "PRE_FRAME_UPDATE";
  Command[(Command["POST_FRAME_UPDATE"] = 56)] = "POST_FRAME_UPDATE";
  Command[(Command["GAME_END"] = 57)] = "GAME_END";
  Command[(Command["ITEM_UPDATE"] = 59)] = "ITEM_UPDATE";
  Command[(Command["FRAME_BOOKEND"] = 60)] = "FRAME_BOOKEND";
})(Command || (Command = {}));

var GameMode;

(function (GameMode) {
  GameMode[(GameMode["VS"] = 2)] = "VS";
  GameMode[(GameMode["ONLINE"] = 8)] = "ONLINE";
})(GameMode || (GameMode = {}));

var Frames;

(function (Frames) {
  Frames[(Frames["FIRST"] = -123)] = "FIRST";
  Frames[(Frames["FIRST_PLAYABLE"] = -39)] = "FIRST_PLAYABLE";
})(Frames || (Frames = {}));

export { Command, Frames, GameMode };
//# sourceMappingURL=types.esm.js.map
