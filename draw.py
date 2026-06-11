
import pygame
import json
import math

pygame.init()

WIDTH = 1400
HEIGHT = 900
GRID = 10

screen = pygame.display.set_mode((WIDTH, HEIGHT))
pygame.display.set_caption("Floor Plan WKT Editor")

font = pygame.font.SysFont(None, 24)

layout = {
    "bedroom": [],
    "wall": [],
    "door": [],
    "window": [],
    "id": 14433,
    "wall_depth": 4.5
}

current_type = "bedroom"
current_polygon = []

colors = {
    "bedroom": (33, 150, 243),
    "wall": (0, 0, 0),
    "door": (76, 175, 80),
    "window": (255, 152, 0)
}

toolbar_height = 50

buttons = [
    ("bedroom", pygame.Rect(10, 10, 120, 30)),
    ("wall", pygame.Rect(140, 10, 120, 30)),
    ("door", pygame.Rect(270, 10, 120, 30)),
    ("window", pygame.Rect(400, 10, 120, 30))
]

dragging = None


def snap(v):
    return round(v / GRID) * GRID


def draw_grid():
    for x in range(0, WIDTH, GRID):
        pygame.draw.line(
            screen,
            (230, 230, 230),
            (x, toolbar_height),
            (x, HEIGHT)
        )

    for y in range(toolbar_height, HEIGHT, GRID):
        pygame.draw.line(
            screen,
            (230, 230, 230),
            (0, y),
            (WIDTH, y)
        )


def draw_toolbar():
    global current_type

    pygame.draw.rect(
        screen,
        (245, 245, 245),
        (0, 0, WIDTH, toolbar_height)
    )

    for name, rect in buttons:

        color = (
            (50, 120, 255)
            if current_type == name
            else
            (200, 200, 200)
        )

        pygame.draw.rect(screen, color, rect)

        txt = font.render(
            name,
            True,
            (0, 0, 0)
        )

        screen.blit(
            txt,
            (rect.x + 10, rect.y + 7)
        )


def draw_polygon(points, color):

    if len(points) >= 2:
        pygame.draw.lines(
            screen,
            color,
            True,
            [(p["x"], p["y"]) for p in points],
            2
        )

    for p in points:

        pygame.draw.circle(
            screen,
            color,
            (p["x"], p["y"]),
            5
        )


def draw_current():

    if len(current_polygon) < 1:
        return

    if len(current_polygon) >= 2:
        pygame.draw.lines(
            screen,
            (255, 0, 0),
            False,
            [(p["x"], p["y"])
             for p in current_polygon],
            2
        )

    for p in current_polygon:
        pygame.draw.circle(
            screen,
            (255, 0, 0),
            (p["x"], p["y"]),
            5
        )


def find_vertex(mx, my):

    for t in ["bedroom",
              "wall",
              "door",
              "window"]:

        for poly in layout[t]:

            for vertex in poly:

                dx = vertex["x"] - mx
                dy = vertex["y"] - my

                if math.sqrt(dx * dx + dy * dy) < 10:
                    return vertex

    return None


def polygon_to_wkt(points):

    coords = points + [points[0]]

    text = ",".join(
        f'{p["x"]} {p["y"]}'
        for p in coords
    )

    return f"(({text}))"


def multipolygon_to_wkt(polys):

    if not polys:
        return "MULTIPOLYGON EMPTY"

    parts = [
        polygon_to_wkt(p)
        for p in polys
    ]

    return (
        "MULTIPOLYGON ("
        + ",".join(parts)
        + ")"
    )


def export_json():

    data = {
        "bedroom":
            multipolygon_to_wkt(
                layout["bedroom"]
            ),

        "wall":
            multipolygon_to_wkt(
                layout["wall"]
            ),

        "door":
            multipolygon_to_wkt(
                layout["door"]
            ),

        "window":
            multipolygon_to_wkt(
                layout["window"]
            ),

        "id":
            layout["id"],

        "wall_depth":
            layout["wall_depth"]
    }

    with open(
        "layout.json",
        "w"
    ) as f:

        json.dump(
            data,
            f,
            indent=2
        )

    print("Saved layout.json")


running = True

clock = pygame.time.Clock()

while running:

    for event in pygame.event.get():

        if event.type == pygame.QUIT:
            running = False

        elif event.type == pygame.KEYDOWN:

            if event.key == pygame.K_e:
                export_json()

            elif event.key == pygame.K_c:

                layout["bedroom"].clear()
                layout["wall"].clear()
                layout["door"].clear()
                layout["window"].clear()

                current_polygon.clear()

        elif event.type == pygame.MOUSEBUTTONDOWN:

            mx, my = event.pos

            if my < toolbar_height:

                for name, rect in buttons:

                    if rect.collidepoint(mx, my):
                        current_type = name

            else:

                if event.button == 1:

                    v = find_vertex(mx, my)

                    if v:
                        dragging = v

                    else:

                        current_polygon.append({
                            "x": snap(mx),
                            "y": snap(my)
                        })

                elif event.button == 3:

                    if len(current_polygon) >= 3:

                        layout[current_type].append(
                            current_polygon.copy()
                        )

                    current_polygon.clear()

        elif event.type == pygame.MOUSEBUTTONUP:

            dragging = None

        elif event.type == pygame.MOUSEMOTION:

            if dragging:

                dragging["x"] = snap(event.pos[0])
                dragging["y"] = snap(event.pos[1])

    screen.fill((255, 255, 255))

    draw_grid()
    draw_toolbar()

    for t in [
        "bedroom",
        "wall",
        "door",
        "window"
    ]:

        for poly in layout[t]:

            draw_polygon(
                poly,
                colors[t]
            )

    draw_current()

    info = (
        "Left Click: add point | "
        "Right Click: finish polygon | "
        "Drag vertex | "
        "E: export | "
        "C: clear"
    )

    screen.blit(
        font.render(
            info,
            True,
            (0, 0, 0)
        ),
        (550, 15)
    )

    pygame.display.flip()
    clock.tick(60)

pygame.quit()

