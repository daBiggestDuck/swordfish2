package engine;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

/**
 * Replays scripted scenarios through the real engine and prints one JSON line per step.
 * Used by game/tests/parity.mjs to prove the in-browser port matches Game.java exactly.
 *
 * Scenario file format (one command per line):
 *   scenario NAME PET SITE TIPPED
 *   tick HOURS | act ACTION | drive SITE
 */
public class ParityDump {

    public static void main(String[] args) throws Exception {
        List<String> lines = Files.readAllLines(Path.of(args[0]));
        Game game = null;
        String name = "";
        int step = 0;
        StringBuilder out = new StringBuilder();
        for (String raw : lines) {
            String line = raw.strip();
            if (line.isEmpty() || line.startsWith("#")) continue;
            String[] p = line.split("\\s+");
            String result;
            switch (p[0]) {
                case "scenario" -> {
                    name = p[1];
                    Pet pet = Pet.byId(p[2]).orElseThrow();
                    Site site = Sites.byId(p[3]).orElseThrow();
                    game = new Game(pet, site, "Parity", Boolean.parseBoolean(p[4]));
                    step = 0;
                    result = "null";
                }
                case "tick" -> result = Json.array(game.tick(Double.parseDouble(p[1])), Event::toJson);
                case "act" -> result = game.act(p[1]).toJson();
                case "drive" -> result = game.drive(p[1]).toJson();
                default -> throw new IllegalArgumentException("bad line: " + line);
            }
            out.append(Json.obj("scenario", Json.q(name), "step", Integer.toString(step++),
                    "op", Json.q(line), "result", result, "state", game.toJson())).append('\n');
        }
        System.out.print(out);
    }
}
