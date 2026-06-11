const GRID = 10;
const ZOOM_MIN = 0.4;
const ZOOM_MAX = 50;
const ZOOM_STEP = 0.5;
const DEFAULT_ZOOM_LEVEL = 5;

const HISTORY_LIMIT = 200;

const CATEGORY_COLORS = {
    living: "#d9d9d9",
    bedroom: "#66c2a5",
    bathroom: "#fc8d62",
    kitchen: "#8da0cb",
    door: "#e78ac3",
    window: "#a6d854",
    wall: "#ffd92f",
    front_door: "#a63603",
    balcony: "#b3b3b3",
    storage: "#a37c52",
    stair: "#9e9ac8"
};

const CATEGORIES = Object.keys(CATEGORY_COLORS);
let SHOW_ANNOTATIONS = true;
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

function resize(){
    canvas.width =
        window.innerWidth - 260;

    canvas.height =
        window.innerHeight;
}
resize();
window.addEventListener("resize",resize);
function showAnnotations() {
    return  SHOW_ANNOTATIONS;
}
const layout = {
    living: [],
    bedroom: [],
    bathroom: [],
    kitchen: [],
    wall: [],
    door: [],
    window: [],
    front_door: [],
    balcony: [],
    storage: [],
    stair: [],
    id: 14433,
    wall_depth: 4.5
};
const EXPORT_HEIGHT = canvas.height;
let currentType = "bedroom";
let currentPolygon = [];
let selectedPolygon = null;
let selectedCategory = null;
let pointer = null;
let hoveredVertex = null;
let dragging = null;
let suppressClick = false;
let mouseDownVertex = null;
let didDragVertex = false;
let zoomLevel = DEFAULT_ZOOM_LEVEL;
let dragStartSnapshot = null;
let offsetX = 0;
let offsetY = 0;

let isPanning = false;
let panStart = null;
const historyStack = [];

const PICK_RADIUS = 5;
const LINE_SNAP_DISTANCE = 5;
const categoryButtonsHost = document.getElementById("categoryButtons");
const buttons = {};
function getAnnotationFontSize(){
   
    const size = 5 / Math.sqrt(zoomLevel);

    return  size ;
}
for(const category of CATEGORIES){
    const button = document.createElement("button");
    button.id = `${category}Btn`;
    button.textContent = category.replace(/_/g," ");
    button.style.borderLeft = `8px solid ${CATEGORY_COLORS[category]}`;
    categoryButtonsHost.appendChild(button);
    buttons[category] = button;
}

function updateButtons(){

    Object.values(buttons)
        .forEach(b => b.classList.remove("active"));

    buttons[currentType]
        .classList.add("active");
}

updateButtons();

for(const category of CATEGORIES){
    buttons[category].onclick = () => {
        currentType = category;
        updateButtons();
    };
}

function getSnapSize(){

    if(zoomLevel >= 3)
        return 1;

    if(zoomLevel >= 2)
        return 2;

    if(zoomLevel >= 1.5)
        return 5;

    return 10;
}
function getGridSize(){
    return GRID;
}
function snap(v){

    const snapSize =
        getSnapSize();

    return (
        Math.round(v / snapSize)
        * snapSize
    );
}

function drawGrid(){

    const maxX = canvas.width / zoomLevel;
    const maxY = canvas.height / zoomLevel;

    const startX =
        Math.floor(
            (-offsetX / zoomLevel) / GRID
        ) * GRID;

    const startY =
        Math.floor(
            (-offsetY / zoomLevel) / GRID
        ) * GRID;

    ctx.strokeStyle="#eee";
    ctx.lineWidth=1/zoomLevel;

    for(
        let x=startX;
        x<startX+maxX+GRID;
        x+=GRID
    ){
        ctx.beginPath();
        ctx.moveTo(x,startY);
        ctx.lineTo(x,startY+maxY+GRID);
        ctx.stroke();
    }

    for(
        let y=startY;
        y<startY+maxY+GRID;
        y+=GRID
    ){
        ctx.beginPath();
        ctx.moveTo(startX,y);
        ctx.lineTo(startX+maxX+GRID,y);
        ctx.stroke();
    }
}
function drawAxes(){

    const maxX = canvas.width / zoomLevel;
    const maxY = canvas.height / zoomLevel;

    const startX = -offsetX / zoomLevel;
    const startY = -offsetY / zoomLevel;

    ctx.save();

    // X axis (horizontal line at y=0)
    ctx.strokeStyle = "#808080";
    ctx.lineWidth = 1 / zoomLevel;

    ctx.beginPath();
    ctx.moveTo(startX, canvas.height);
    ctx.lineTo(startX + maxX, canvas.height);
    ctx.stroke();

    // Y axis (vertical line at x=0)
    ctx.strokeStyle = "#808080";

    ctx.beginPath();
    ctx.moveTo(0, startY);
    ctx.lineTo(0, startY + maxY);
    ctx.stroke();

    // origin marker
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.arc(0, canvas.height, 5 / zoomLevel, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
}
function drawPointerGuides(){

    if(!pointer)
        return;

    const screenX =
        pointer.x * zoomLevel + offsetX;

    const screenY =
        pointer.y * zoomLevel + offsetY;

    ctx.save();

    ctx.setTransform(1,0,0,1,0,0);

    ctx.setLineDash([6,4]);
    ctx.strokeStyle="#90a4ae";
    ctx.lineWidth=1;

    ctx.beginPath();
    ctx.moveTo(screenX,0);
    ctx.lineTo(screenX,canvas.height);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0,screenY);
    ctx.lineTo(canvas.width,screenY);
    ctx.stroke();

    ctx.setLineDash([]);

    ctx.fillStyle="#455a64";
    ctx.font=`${10+getAnnotationFontSize()}px Arial`;

    ctx.fillText(
        `x: ${pointer.x}`,
        screenX + 8,
        15
    );

    ctx.fillText(
        `y: ${canvas.height-pointer.y}`,
        8,
        screenY - 8
    );

    ctx.restore();
}
function drawVertex(point,color){

    const isHighlighted =
        point===hoveredVertex ||
        point===dragging;

    ctx.fillStyle=color;
    ctx.beginPath();
    ctx.arc(point.x,point.y,8/Math.sqrt(zoomLevel),0,Math.PI*2);
    ctx.fill();

    if(isHighlighted){
        ctx.strokeStyle="#ffffff";
        ctx.lineWidth=2;
        ctx.beginPath();
        ctx.arc(point.x,point.y,10/Math.sqrt(zoomLevel),0,Math.PI*2);
        ctx.stroke();

        ctx.strokeStyle="#d32f2f";
        ctx.lineWidth=2;
        ctx.beginPath();
        ctx.arc(point.x,point.y,12/Math.sqrt(zoomLevel),0,Math.PI*2);
        ctx.stroke();
    }
}

const colors = CATEGORY_COLORS;

function getDistance(a,b){
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    return Math.sqrt(dx*dx + dy*dy);
}

function getAngleBetween(v1,v2){

    const mag1 = Math.sqrt(v1.x*v1.x + v1.y*v1.y);
    const mag2 = Math.sqrt(v2.x*v2.x + v2.y*v2.y);

    if(mag1===0 || mag2===0)
        return null;

    const dot = v1.x*v2.x + v1.y*v2.y;
    const cosTheta = Math.max(-1,Math.min(1,dot/(mag1*mag2)));
    return Math.acos(cosTheta) * 180 / Math.PI;
}

function drawAnnotation(text,x,y,color){

    ctx.save();
    ctx.font=`${getAnnotationFontSize()}px Arial`;
    const paddingX = 4/Math.sqrt(zoomLevel);
    const paddingY = 3/Math.sqrt(zoomLevel);
    const width = ctx.measureText(text).width + paddingX*2;
    const height = getAnnotationFontSize() + paddingY*2;

    ctx.fillStyle="rgba(255,255,255,0.4)";
    ctx.fillRect(x - width/2,y - height/2,width,height);

    ctx.strokeStyle="rgba(120,120,120,0.5)";
    ctx.lineWidth=1;
    ctx.lineWidth = 1 / zoomLevel;
    ctx.strokeRect(x - width/2,y - height/2,width,height);

    ctx.fillStyle=color || "#455a64";
    ctx.textAlign="center";
    ctx.textBaseline="middle";
    ctx.fillText(text,x,y+0.5);

    ctx.restore();
}

function drawSegmentLength(a,b,color){

    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const mag = Math.sqrt(dx*dx + dy*dy) || 1;

    const labelOffset = 12 / zoomLevel;

    const offsetX = -dy / mag * labelOffset;
    const offsetY = dx / mag * labelOffset;

    drawAnnotation(
        `${getDistance(a,b).toFixed(1)} px`,
        mx + offsetX,
        my + offsetY,
        color
    );
}

function drawVertexAngle(prev,curr,next,color){

    const v1 = {
        x: prev.x - curr.x,
        y: prev.y - curr.y
    };

    const v2 = {
        x: next.x - curr.x,
        y: next.y - curr.y
    };

    const angle = getAngleBetween(v1,v2);

    if(angle===null)
        return;

 const offset = 18 / zoomLevel;

drawAnnotation(
    `${angle.toFixed(1)}°`,
    curr.x,
    curr.y - offset,
    color
);
}

function drawClosedPolygonAnnotations(points,color){

    if(points.length < 2)
        return;

    for(let i=0;i<points.length;i++){

        const a = points[i];
        const b = points[(i+1)%points.length];
        drawSegmentLength(a,b,color);
    }

    if(points.length < 3)
        return;

    for(let i=0;i<points.length;i++){

        const prev = points[(i-1+points.length)%points.length];
        const curr = points[i];
        const next = points[(i+1)%points.length];

        drawVertexAngle(prev,curr,next,color);
    }
}

function drawOpenPolylineAnnotations(points,color){

    if(points.length < 2)
        return;

    for(let i=0;i<points.length-1;i++){

        drawSegmentLength(
            points[i],
            points[i+1],
            color
        );
    }

    if(points.length < 3)
        return;

    for(let i=1;i<points.length-1;i++){
        drawVertexAngle(
            points[i-1],
            points[i],
            points[i+1],
            color
        );
    }
}

function drawPreviewFromLastPoint(){

    if(!pointer || currentPolygon.length===0)
        return;

    const last = currentPolygon[currentPolygon.length-1];

    ctx.save();
    ctx.setLineDash([4,4]);
    ctx.strokeStyle="#9e9e9e";
    ctx.lineWidth=2;
    ctx.beginPath();
    ctx.moveTo(last.x,last.y);
    ctx.lineTo(pointer.x,pointer.y);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle="rgba(117,117,117,0.5)";
    ctx.beginPath();
    ctx.arc(pointer.x,pointer.y,10/Math.sqrt(zoomLevel),0,Math.PI*2);
    ctx.fill();
    ctx.restore();

    drawSegmentLength(last,pointer,"#616161");

    if(currentPolygon.length>=2){
        const prev = currentPolygon[currentPolygon.length-2];
        drawVertexAngle(prev,last,pointer,"#616161");
    }else{

        const absolute =
            Math.atan2(
                pointer.y - last.y,
                pointer.x - last.x
            ) * 180 / Math.PI;

        drawAnnotation(
            `${absolute.toFixed(1)}°`,
            last.x,
            last.y - 18,
            "#616161"
        );
    }
}

function drawPolygon(points,color){
const isSelected =
    selectedPolygon &&
    selectedPolygon.poly === points;
    if(points.length===0)
        return;

    const fillColor = color || "#bdbdbd";
    ctx.fillStyle = hexToRgba(fillColor, 0.35);
    ctx.beginPath();
    ctx.moveTo(points[0].x,points[0].y);
    for(let i=1;i<points.length;i++){
        ctx.lineTo(points[i].x,points[i].y);
    }
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle=color;
    ctx.strokeStyle = isSelected ? "#ff3b30" : color;
    ctx.lineWidth=2;

    ctx.beginPath();

    ctx.moveTo(
        points[0].x,
        points[0].y
    );

    for(let i=1;i<points.length;i++){

        ctx.lineTo(
            points[i].x,
            points[i].y
        );
    }

    ctx.closePath();
    ctx.stroke();

    points.forEach(p=> drawVertex(p,color));
    if (showAnnotations() || (selectedPolygon && selectedPolygon.poly === points)) {
     drawClosedPolygonAnnotations(points, "#37474f");
}}

function hexToRgba(hex, alpha){

    const clean = hex.replace("#","");
    const full = clean.length === 3
        ? clean.split("").map(ch => ch + ch).join("")
        : clean;

    const value = parseInt(full, 16);
    const r = (value >> 16) & 255;
    const g = (value >> 8) & 255;
    const b = value & 255;

    return `rgba(${r},${g},${b},${alpha})`;
}

function drawCurrent(){

    if(currentPolygon.length===0)
        return;

    ctx.strokeStyle="red";
    ctx.lineWidth=2;

    ctx.beginPath();

    ctx.moveTo(
        currentPolygon[0].x,
        currentPolygon[0].y
    );

    for(let i=1;i<currentPolygon.length;i++){

        ctx.lineTo(
            currentPolygon[i].x,
            currentPolygon[i].y
        );
    }

    ctx.stroke();

    currentPolygon.forEach(p=> drawVertex(p,"red"));
if (showAnnotations()) {
    drawOpenPolylineAnnotations(currentPolygon, "#37474f");
}    drawPreviewFromLastPoint();
}
function pointInPolygon(pt, poly){

    // ray casting algorithm
    let inside = false;

    for(let i=0, j=poly.length-1; i<poly.length; j=i++){

        const xi = poly[i].x, yi = poly[i].y;
        const xj = poly[j].x, yj = poly[j].y;

        const intersect =
            ((yi > pt.y) !== (yj > pt.y)) &&
            (pt.x < (xj - xi) * (pt.y - yi) / (yj - yi + 0.00001) + xi);

        if(intersect)
            inside = !inside;
    }

    return inside;
}
function findPolygonAt(x,y){

    for(const category of CATEGORIES){

        const polys = layout[category];

        for(let i=0;i<polys.length;i++){

            if(pointInPolygon({x,y}, polys[i])){
                return {
                    category,
                    index: i,
                    poly: polys[i]
                };
            }
        }
    }

    return null;
}
function render(){

    ctx.clearRect(
        0,
        0,
        canvas.width,
        canvas.height
    );

    ctx.save();

    ctx.translate(offsetX,offsetY);
    ctx.scale(zoomLevel,zoomLevel);
    drawGrid();
    drawAxes();  
    Object.keys(layout)
        .forEach(type=>{

        if(!Array.isArray(layout[type]))
            return;

        layout[type].forEach(poly=>{

            drawPolygon(
                poly,
                colors[type]
            );
        });
    });

    drawCurrent();

    ctx.restore();
    drawPointerGuides();

}

render();

function cloneState(){
    return {
        layout: JSON.parse(JSON.stringify(layout)),
        currentPolygon: JSON.parse(JSON.stringify(currentPolygon)),
        currentType
    };
}

function applyState(state){

    for(const category of CATEGORIES){
        layout[category] = state.layout[category] || [];
    }
    layout.id = state.layout.id;
    layout.wall_depth = state.layout.wall_depth;

    currentPolygon = state.currentPolygon || [];
    currentType = state.currentType || currentType;
    updateButtons();
}

function pushHistory(){
    historyStack.push(cloneState());
    if(historyStack.length > HISTORY_LIMIT)
        historyStack.shift();
}

function pushSnapshot(snapshot){
    if(!snapshot)
        return;
    historyStack.push(snapshot);
    if(historyStack.length > HISTORY_LIMIT)
        historyStack.shift();
}

function undo(){

    if(historyStack.length===0)
        return;

    const prev = historyStack.pop();
    applyState(prev);

    hoveredVertex = null;
    dragging = null;
    pointer = null;
    mouseDownVertex = null;
    didDragVertex = false;
    suppressClick = false;
    dragStartSnapshot = null;

    render();
}
function getWorldPosition(e,snapToGrid=false){

    const rect = canvas.getBoundingClientRect();

    const x =
        (e.clientX - rect.left - offsetX)
        / zoomLevel;

    const y =
        (e.clientY - rect.top - offsetY)
        / zoomLevel;

    if(!snapToGrid)
        return {x,y};

    return {
        x:snap(x),
        y:snap(y)
    };
}
function setZoom(nextZoom){

    zoomLevel = Math.max(
        ZOOM_MIN,
        Math.min(ZOOM_MAX,nextZoom)
    );

    document.getElementById("zoomLabel")
        .textContent = `Zoom: ${Math.round(zoomLevel*100)}%`;

    render();
}

function goHome(){
    zoomLevel = DEFAULT_ZOOM_LEVEL;

    offsetX = (40 * zoomLevel);
    offsetY = -(EXPORT_HEIGHT-150 )* zoomLevel;

    document.getElementById("zoomLabel")
        .textContent = `Zoom: 100%`;

    render();
}
goHome()

canvas.addEventListener("click",e=>{

    if(dragging)
        return;

    if(mouseDownVertex && !didDragVertex){

        pushHistory();

        currentPolygon.push({
            x: mouseDownVertex.x,
            y: mouseDownVertex.y
        });

        mouseDownVertex = null;
        suppressClick = false;
        render();
        return;
    }

    if(didDragVertex){
        mouseDownVertex = null;
        didDragVertex = false;
        suppressClick = false;
        return;
    }

    if(suppressClick){
        suppressClick=false;
        return;
    }

let pos =
    getWorldPosition(e,false);

const vertexSnap =
    findVertex(pos.x,pos.y);

if(vertexSnap){

    pos={
        x:vertexSnap.x,
        y:vertexSnap.y
    };
}
else{

    const lineSnap =
        findNearestLinePoint(
            pos.x,
            pos.y
        );

    if(lineSnap){

        pos={
            x:lineSnap.x,
            y:lineSnap.y
        };
    }
    else{

        pos={
            x:snap(pos.x),
            y:snap(pos.y)
        };
    }
}
    pushHistory();

    currentPolygon.push({
        x: pos.x,
        y: pos.y
    });

    mouseDownVertex = null;
    didDragVertex = false;

    render();
});

function finishCurrentPolygon(){

    if(currentPolygon.length<3)
        return;

    pushHistory();

    layout[currentType]
        .push(
            JSON.parse(
                JSON.stringify(
                    currentPolygon
                )
            )
        );

    currentPolygon=[];
    hoveredVertex=null;

    render();
}

 
document.getElementById("toggleAnnotationsBtn").onclick = () => {
    SHOW_ANNOTATIONS = !SHOW_ANNOTATIONS;
    render();
};

 
document
.getElementById("clearBtn")
.onclick=()=>{

    pushHistory();

    for(const category of CATEGORIES){
        layout[category]=[];
    }

    currentPolygon=[];

    render();
};

function getAllVertices(){

    const all=[];
    const allTypes=["bedroom","wall","door","window"];

    for(const type of allTypes){
        for(const poly of layout[type]){
            for(const vertex of poly){
                all.push(vertex);
            }
        }
    }

    for(const vertex of currentPolygon){
        all.push(vertex);
    }

    return all;
}
function projectPointToSegment(p,a,b){

    const abx = b.x-a.x;
    const aby = b.y-a.y;

    const lenSq =
        abx*abx + aby*aby;

    if(lenSq===0)
        return null;

    let t =
        (
            (p.x-a.x)*abx +
            (p.y-a.y)*aby
        ) / lenSq;

    t=Math.max(0,Math.min(1,t));

    return{
        x:a.x + abx*t,
        y:a.y + aby*t
    };
}
function findNearestLinePoint(x,y){

    let best=null;
    let bestDist=Infinity;

    for(const category of CATEGORIES){

        for(const poly of layout[category] || []){

            for(let i=0;i<poly.length;i++){

                const a=poly[i];
                const b=
                    poly[(i+1)%poly.length];

                const projected =
                    projectPointToSegment(
                        {x,y},
                        a,
                        b
                    );

                if(!projected)
                    continue;

                const dx=
                    projected.x-x;

                const dy=
                    projected.y-y;

                const dist=
                    Math.sqrt(dx*dx+dy*dy);

                if(
                    dist<LINE_SNAP_DISTANCE &&
                    dist<bestDist
                ){
                    bestDist=dist;
                    best=projected;
                }
            }
        }
    }

    return best;
}
function findVertex(x,y){

    let closest = null;
    let minDist = Infinity;

    for(const vertex of getAllVertices()){

        const dx = vertex.x - x;
        const dy = vertex.y - y;
        const dist = Math.sqrt(dx*dx+dy*dy);

        if(dist < PICK_RADIUS && dist < minDist){
            minDist = dist;
            closest = vertex;
        }
    }

    return closest;
}

canvas.addEventListener(
"mousedown",
e=>{
if(e.button===1){

    isPanning=true;
    // change cursor to grabbing
    canvas.style.cursor = "grabbing";
    panStart={
        x:e.clientX,
        y:e.clientY,
        offsetX,
        offsetY
    };

    return;
}
if(isPanning){

    offsetX =
        panStart.offsetX +
        (e.clientX - panStart.x);

    offsetY =
        panStart.offsetY +
        (e.clientY - panStart.y);

    render();
    return;
}
        const world = getWorldPosition(e,false);

    dragging=
      findVertex(
                world.x,
                world.y
      );

        dragStartSnapshot = dragging ? cloneState() : null;

        mouseDownVertex = dragging;
        didDragVertex = false;
        hoveredVertex = dragging;
        suppressClick = !!dragging;

        render();
});

canvas.addEventListener(
"mousemove",
e=>{
if(isPanning){

    offsetX =
        panStart.offsetX +
        (e.clientX - panStart.x);

    offsetY =
        panStart.offsetY +
        (e.clientY - panStart.y);

    render();
    return;
}
    const world = getWorldPosition(e,false);
    const snapped = {
        x: snap(world.x),
        y: snap(world.y)
    };

    pointer = {
        x: snapped.x,
        y: snapped.y
    };

    hoveredVertex = findVertex(
        world.x,
        world.y
    );
    selectedPolygon = findPolygonAt(world.x, world.y);
    if(!dragging){
        render();
        return;
    }

        const nextX = snapped.x;
        const nextY = snapped.y;

        if(
                dragging.x!==nextX ||
                dragging.y!==nextY
        ){
                didDragVertex = true;
        }

    dragging.x=
            nextX;

    dragging.y=
            nextY;

    render();
});

canvas.addEventListener(
"mouseup",
()=>{
    isPanning = false;
    // reset cursor
    canvas.style.cursor = "default";
panStart=null;
    if(didDragVertex){
        pushSnapshot(dragStartSnapshot);
    }

    dragging=null;
    dragStartSnapshot=null;
});

canvas.addEventListener(
"mouseleave",
()=>{
    dragging=null;
    dragStartSnapshot=null;
    mouseDownVertex=null;
    didDragVertex=false;
    hoveredVertex=null;
    pointer=null;
    render();
});

document.addEventListener("keydown",e=>{

    const key = (e.key || "").toLowerCase();
if(key === "escape"){

    if(currentPolygon.length > 0){

        pushHistory();

        currentPolygon = [];
        hoveredVertex = null;
        dragging = null;
        pointer = null;
        mouseDownVertex = null;
        didDragVertex = false;
        suppressClick = false;

        render();
    }

    return;
}
    if((e.ctrlKey || e.metaKey) && key==="z"){
        e.preventDefault();
        undo();
        return;
    }

    if(key==="+"){
        e.preventDefault();
        setZoom(zoomLevel + ZOOM_STEP);
        return;
    }

    if(key==="-"){
        e.preventDefault();
        setZoom(zoomLevel - ZOOM_STEP);
        return;
    }
const isDeleteKey =
    e.key === "Delete" ||
    e.key === "Backspace";

if(isDeleteKey){

    if(selectedPolygon){

        pushHistory();

        const arr =
            layout[selectedPolygon.category];

        arr.splice(selectedPolygon.index,1);

        selectedPolygon = null;

        render();
    }

    return;
}
    if(e.key!=="Enter")
        return;

    const tag =
        (e.target && e.target.tagName) || "";

    if(
        tag==="TEXTAREA" ||
        tag==="INPUT" ||
        (e.target && e.target.isContentEditable)
    ){
        return;
    }

    e.preventDefault();
    finishCurrentPolygon();
});
canvas.addEventListener("wheel",e=>{

    e.preventDefault();

    const rect =
        canvas.getBoundingClientRect();

    const mouseX =
        e.clientX - rect.left;

    const mouseY =
        e.clientY - rect.top;

    const worldX =
        (mouseX - offsetX)
        / zoomLevel;

    const worldY =
        (mouseY - offsetY)
        / zoomLevel;

    const nextZoom =
        Math.max(
            ZOOM_MIN,
            Math.min(
                ZOOM_MAX,
                zoomLevel +
                (
                    e.deltaY < 0
                    ? ZOOM_STEP
                    : -ZOOM_STEP
                )
            )
        );

    offsetX =
        mouseX -
        worldX * nextZoom;

    offsetY =
        mouseY -
        worldY * nextZoom;

    zoomLevel =
        nextZoom;

    document
        .getElementById("zoomLabel")
        .textContent =
        `Zoom: ${Math.round(zoomLevel*100)}%`;

    render();

},{passive:false});



document.getElementById("zoomInBtn").onclick=()=>{
    setZoom(zoomLevel + ZOOM_STEP);
};

document.getElementById("zoomOutBtn").onclick=()=>{
    setZoom(zoomLevel - ZOOM_STEP);
};

document.getElementById("zoomResetBtn").onclick=()=>{
    setZoom(DEFAULT_ZOOM_LEVEL);
};

document.getElementById("homeBtn").onclick = ()=>{
    goHome();
};

function polygonToWKT(points){

    const coords =
      [...points,points[0]]
      .map(
        p =>
        `${p.x} ${EXPORT_HEIGHT-p.y}`
      )
      .join(",");

    return `((${coords}))`;
}

function multipolygonToWKT(polys){

    if(polys.length===0)
        return "MULTIPOLYGON EMPTY";

    return `MULTIPOLYGON (${polys
        .map(
            p =>
            polygonToWKT(p)
        )
        .join(",")})`;
}

document
.getElementById("exportBtn")
.onclick=()=>{

    const result = {

        ...Object.fromEntries(
    CATEGORIES
        .map(category => {

            const wkt =
                multipolygonToWKT(layout[category]);

            const hasData =
                layout[category] &&
                layout[category].length > 0;

            if(!hasData)
                return null;

            return [category, wkt];
        })
        .filter(Boolean)
),

        id: layout.id,

        wall_depth:
            layout.wall_depth
    };

        const text = JSON.stringify(
                result,
                null,
                2
        );

        document
            .getElementById("output")
            .value = text;

        const now = new Date();
        const pad = n => String(n).padStart(2,"0");
        const stamp =
                `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}_`+
                `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;

        const filename = `plan_export_${stamp}.json`;
        const blob = new Blob([text],{type:"application/json"});
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
};
document.getElementById("loadBtn").onclick = () => {
    document.getElementById("fileInput").click();
};
document.getElementById("fileInput").addEventListener("change", async (e) => {
    try {
        const file = e.target.files[0];
        if (!file) return;

        const text = await file.text();
        const data = JSON.parse(text);

        console.log("LOADED JSON:", data);

        loadFromJSON(data);

    } catch (err) {
        console.error("LOAD FAILED:", err);
        alert("Load failed: check console");
    }
});
function parseWKT(wkt) {
    if (!wkt || typeof wkt !== "string") return [];
    if (wkt.includes("EMPTY")) return [];

    // normalize spacing
    wkt = wkt.trim();

    // -------------------------
    // POLYGON
    // -------------------------
    if (wkt.startsWith("POLYGON")) {
        const inner = wkt
            .replace("POLYGON", "")
            .trim()
            .replace(/^\(\(/, "")
            .replace(/\)\)$/, "");

        const points = inner.split(",").map(pair => {
            const [x, y] = pair.trim().split(" ").map(Number);

            return {
                x,
                y: EXPORT_HEIGHT - y
            };
        }).filter(p => !Number.isNaN(p.x));

        return points.length >= 3 ? [points] : [];
    }

    // -------------------------
    // MULTIPOLYGON
    // -------------------------
    if (wkt.startsWith("MULTIPOLYGON")) {
        const polygons = [];

        const inner = wkt
            .replace("MULTIPOLYGON", "")
            .trim();

        // match ((...))
        const matches = inner.match(/\(\([^\)]+\)\)/g);
        if (!matches) return [];

        for (const m of matches) {
            const clean = m
                .replace(/\(\(/g, "")
                .replace(/\)\)/g, "");

            const points = clean.split(",").map(pair => {
                const [x, y] = pair.trim().split(" ").map(Number);

                return {
                    x,
                    y: EXPORT_HEIGHT - y
                };
            }).filter(p => !Number.isNaN(p.x));

            if (points.length >= 3) {
                polygons.push(points);
            }
        }

        return polygons;
    }

    console.warn("Unknown WKT type:", wkt);
    return [];
}
function loadFromJSON(data) {
    console.log("Applying layout...");

    pushHistory();

    // reset
    for (const c of CATEGORIES) {
        layout[c] = [];
    }

    for (const key in data) {
        console.log("Processing:", key, data[key]);

        if (key === "id") {
            layout.id = data.id;
            continue;
        }

        if (key === "wall_depth") {
            layout.wall_depth = data.wall_depth;
            continue;
        }

        if (!CATEGORY_COLORS[key]) continue;

        const parsed = parseWKT(data[key]);
        
        console.log(key, "parsed polygons:", parsed.length);

        layout[key] = parsed;
    }

    currentPolygon = [];
    selectedPolygon = null;
    hoveredVertex = null;

    render();

    console.log("LOAD COMPLETE");
}