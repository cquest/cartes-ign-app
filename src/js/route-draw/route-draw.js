import RouteDrawDOM from "./route-draw-dom";
import Globals from "../globals";
import ElevationLineControl from "../elevation-line-control";
import DOM from '../dom';
import RouteDrawLayers from "./route-draw-styles";
import Reverse from "../services/reverse";

import MapLibreGL from "maplibre-gl";


/**
 * Interface sur le tracé d'itinéraire
 * @module RouteDraw
 */
class RouteDraw {
    /**
     * constructeur
     * @constructs
     * @param {*} map
     * @param {*} options
     */
    constructor (map, options) {
        this.options = options || {
            target: null,
            configuration: {},
            style: {},
            transport: null,
            mode: null,
        };

        // configuration
        this.configuration = this.options.configuration || {
            linesource: "route-draw-line",
            pointsource: "route-draw-point",
            api: "https://data.geopf.fr/navigation/itineraire?resource=bdtopo-osrm&getSteps=false&timeUnit=second&optimization=shortest",
            template: (values) => {
                return `start=${values.start.lng},${values.start.lat}&end=${values.end.lng},${values.end.lat}&profile=${values.profile}`
            }
        }

        // style
        this.style = this.options.style || {
            color: "26a581",
            opacity: 0.85
        };

        this.transport = this.options.transport || "pedestrian"; // one of "pedestrian", "car"

        this.data = {
            duration: 0,
            distance: 0,
            dplus: 0,
            dminus: 0,
            // point: GeoJSON feature point with properties: "name"
            points: [],
            // step: GeoJSON feature linestring with properties: "start_name", "end_name", "duration", "distance", "dplus", "dminus"
            steps: [],
        }

        // mode: libre 0 ou guidé 1
        this.mode = this.options.mode || 1;

        // target
        this.target = this.options.target;

        // carte
        this.map = map;

        // rendu graphique
        this.render();

        // Profil Altimétrique
        this.elevation = new ElevationLineControl({target: document.getElementById("routedraw-elevationline")});

        // fonction d'event avec bind
        this.handleAddWayPoint = this.#onAddWayPoint.bind(this);
        this.handleTouchStartPoint = this.#onTouchStartPoint.bind(this);
        this.handleTouchStartLine = this.#onTouchStartLine.bind(this);
        this.handleTouchMove = this.#onTouchMove.bind(this);
        this.handleTouchEnd = this.#onTouchEnd.bind(this);
        this.handleDeletePoint = this.#onDeleteWayPoint.bind(this);
        this.handleCancelChange = this.#cancelChange.bind(this);
        this.handleRestoreChange = this.#restoreChange.bind(this);

        // historique pour l'annulation et la restauration
        this.dataHistory = [];
        this.currentHistoryPosition = 0;

        // point actuellement déplacé par l'interactivité
        this.movedPoint = null;
        this.movedPointIndex = null;

        // compteurs pour identifiants uniques de points et steps
        this.nextPointId = 0;
        this.nextStepId = 0;

        // mode suppression de points
        this.delete = false;

        // popup d'aide
        this.popup = null;

        // annulation de la reqête fetch
        this.controller = new AbortController();

        // requête en cours d'execution ?
        this.loading = false;

        return this;
    }

    /**
     * activation du contrôle
     * @public
     */
    activate() {
        this.dataHistory.unshift(JSON.parse(JSON.stringify(this.data)));
        this.#listeners()
    }

    /**
     * creation de l'interface
     * @public
     */
    render () {
        var target = this.target || document.getElementById("routeDrawWindow");
        if (!target) {
            console.warn();
            return;
        }
        this.target = target;

        var container = this.getContainer(this.transport);
        if (!container) {
            console.warn();
            return;
        }

        // ajout du container
        target.appendChild(container);
    }

    /**
     * enregistrement de l'itinéraire
     * @param {*} settings
     * @public
     */
    compute (settings) {

    }

    /**
     * ajout d'ecouteurs pour la saisie interactive
     */
    #listeners() {
        this.map.on("click", this.handleAddWayPoint);
        this.map.on("touchstart",RouteDrawLayers["point"].id, this.handleTouchStartPoint);
        this.map.on("touchstart", RouteDrawLayers["line"].id, this.handleTouchStartLine);
        DOM.$routeDrawCancel.addEventListener("click", this.handleCancelChange);
        DOM.$routeDrawRestore.addEventListener("click", this.handleRestoreChange);
    }

    /**
     * retrait d'ecouteurs pour attendre les traitements
     */
    #deactivate() {
        this.map.off("click", this.handleAddWayPoint);
        this.map.off("touchstart",RouteDrawLayers["point"].id, this.handleTouchStartPoint);
        this.map.off("touchstart", RouteDrawLayers["line"].id, this.handleTouchStartLine);
        DOM.$routeDrawCancel.removeEventListener("click", this.handleCancelChange);
        DOM.$routeDrawRestore.removeEventListener("click", this.handleRestoreChange);
    }

    /**
     * ecouteur lors du déplacement d'un nouveau waypoint depuis une ligne sur la carte - début
     * @param {*} e
     * @returns
     */
    #onTouchStartLine(e) {
        // TODO gestion d'erreurs
        // TODO patience
        e.preventDefault();
        if (this.map.queryRenderedFeatures(e.point, {
            layers: [RouteDrawLayers["point"].id],
        })[0]) {
            return;
        }
        const feature = this.map.queryRenderedFeatures(e.point, {
            layers: [RouteDrawLayers["line"].id],
        })[0];
        console.warn(feature);
        this.movedPointIndex = this.data.steps.findIndex((step) => {
            return step.properties?.id === feature?.properties?.id;
        }) + 1;
        var coordinates = e.lngLat;
        const newPoint = {
            type: "Feature",
            geometry: {
                type: "Point",
                coordinates: [coordinates.lng, coordinates.lat]
            },
            properties: {
                name: "",
                id: this.nextPointId,
            }
        }
        this.nextPointId++;
        if (this.movedPointIndex < this.data.steps.length) {
            const newStep = JSON.parse(JSON.stringify(this.data.steps[this.movedPointIndex]));
            newStep.properties.id = this.nextStepId;
            newStep.properties.invisible = true;
            this.nextStepId++;
            this.data.steps.splice(this.movedPointIndex, 0, newStep);
        }
        this.data.points.splice(this.movedPointIndex, 0, newPoint);
        this.movedPoint = this.data.points[this.movedPointIndex];
        this.movedPoint.properties.highlight = true;
        this.#updateSources();

        this.map.on('touchmove', this.handleTouchMove);
        this.map.once('touchend', this.handleTouchEnd);
    }

    /**
     * ecouteur lors du déplacement d'un waypoint sur la carte - début
     * @param {*} e
     * @returns
     */
    #onTouchStartPoint(e) {
        // TODO gestion d'erreurs
        // TODO patience
        e.preventDefault();
        const feature = this.map.queryRenderedFeatures(e.point, {
            layers: [RouteDrawLayers["point"].id],
        })[0];
        this.movedPointIndex = this.data.points.findIndex((point) => {
            return point.properties?.id === feature?.properties?.id;
        });
        this.movedPoint = this.data.points[this.movedPointIndex];
        this.movedPoint.properties.highlight = true;
        this.#updateSources();

        this.map.on('touchmove', this.handleTouchMove);
        this.map.once('touchend', this.handleTouchEnd);
    }

    /**
     * ecouteur lors du déplacement d'un waypoint sur la carte - pendant
     * @param {*} e
     * @returns
     */
    #onTouchMove(e) {
        const coords = e.lngLat;
        this.movedPoint.geometry.coordinates = [coords.lng, coords.lat];
        this.#updateSources();
    }

    /**
     * ecouteur lors du déplacement d'un waypoint sur la carte - fin
     * @param {*} e
     * @returns
     */
    async #onTouchEnd(e) {
        this.#deactivate();
        this.map.off("touchmove", this.handleTouchMove);
        const index = this.movedPointIndex;
        const address = await this.#computePointName(e.lngLat);
        this.movedPoint.properties.highlight = false;
        this.movedPoint.properties.name = address;
        this.movedPoint = null;
        this.movedPointIndex = null;
        this.#updateSources();
        var promises = [];
        if (index > 0) {
            promises.push(this.#computeStep(index - 1));
        }
        if (index < this.data.points.length - 1) {
            promises.push(this.#computeStep(index));
        }
        Promise.all(promises).then( () => {
            // Enregistrement de l'état dans l'historique
            this.#saveState();
            this.#listeners();
        });
    }

    /**
     * ecouteur lors de l'ajout d'un point avec addWayPoint()
     * @param {*} e
     * @returns
     */
    async #onAddWayPoint(e) {
        // On empêche l'intéraction tant que les opérations ne sont pas terminées
        this.map.off("click", this.handleAddWayPoint);
        // Si on a cliqué sur un waypoint, on ne fait rien)
        if(this.map.getSource(this.configuration.pointsource) && this.map.queryRenderedFeatures(e.point, {
            layers: [RouteDrawLayers["point"].id],
        })[0]) {
            this.map.on("click", this.handleAddWayPoint);
            return;
        }
        // TODO: Patience
        this.#deactivate();
        var coordinates = e.lngLat;
        var length = this.data.points.push({
            type: "Feature",
            geometry: {
                type: "Point",
                coordinates: [coordinates.lng, coordinates.lat]
            },
            properties: {
                name: "",
                id: this.nextPointId,
            }
        });
        this.nextPointId++;

        const address = await this.#computePointName(coordinates);

        // on ajoute les resultats dans le tableau (avec la length récupérée avant la promesse pour gérer l'asynchrone)
        this.data.points[length - 1].geometry.coordinates = [coordinates.lng, coordinates.lat];
        this.data.points[length - 1].properties.name = address;

        // Si pas encore de source, on ajoute les sources et layers à la carte
        if (this.map.getSource(this.configuration.pointsource)) {
            this.#updateSources();
        } else {
            this.#addSourcesAndLayers();
        }

        // Pas d'autre étape s'il n'y a qu'un point (premier point)
        if (this.data.points.length < 2) {
            if (Globals.backButtonState === "routeDraw") {
                this.#listeners();
            }
            DOM.$routeDrawCancel.classList.remove("inactive");
            // Enregistrement de l'état dans l'historique
            this.#saveState();
            return;
        }

        await this.#computeStep(this.data.points.length - 2);
        // Enregistrement de l'état dans l'historique
        this.#saveState();
        // Affichage et réactivation de l'intéractivité si on est toujours dans le tracé d'itinéraire
        if (Globals.backButtonState === "routeDraw") {
            DOM.$routeDrawCancel.classList.remove("inactive");
            this.#listeners();
        }
    }

    /**
     * ecouteur lors de la suppression d'un point
     * @param {*} e
     * @returns
     */
    async #onDeleteWayPoint(e) {
        // TODO gestion d'erreur
        // TODO patience
        // On empêche l'intéraction tant que les opérations ne sont pas terminées
        this.map.off("click", RouteDrawLayers["point"].id, this.handleDeletePoint);
        this.#deactivate();
        const feature = this.map.queryRenderedFeatures(e.point, {
            layers: [RouteDrawLayers["point"].id],
        })[0];
        const deleteIndex = this.data.points.findIndex((point) => {
            return point.properties?.id === feature?.properties?.id;
        });
        this.data.points.splice(deleteIndex, 1);
        if (this.data.steps.length < 1) {
            this.map.on("click", RouteDrawLayers["point"].id, this.handleDeletePoint);
            DOM.$routeDrawCancel.addEventListener("click", this.handleCancelChange);
            DOM.$routeDrawRestore.addEventListener("click", this.handleRestoreChange);
            return;
        };
        if (deleteIndex == 0 || this.data.steps.length == 1) {
            this.data.steps.splice(0, 1);
            await this.#updateElevation();
            if (Globals.backButtonState === "routeDraw") {
                this.__updateRouteInfo(this.data);
            }
            this.#updateSources()
        } else if (deleteIndex == this.data.points.length) {
            this.data.steps.splice(deleteIndex - 1, 1);
            await this.#updateElevation();
            if (Globals.backButtonState === "routeDraw") {
                this.__updateRouteInfo(this.data);
            }
            this.#updateSources()
        } else {
            this.data.steps.splice(deleteIndex - 1, 1);
            await this.#computeStep(deleteIndex - 1);
        }
        this.map.on("click", RouteDrawLayers["point"].id, this.handleDeletePoint);
        // Enregistrement de l'état dans l'historique
        this.#saveState();
        DOM.$routeDrawCancel.addEventListener("click", this.handleCancelChange);
        DOM.$routeDrawRestore.addEventListener("click", this.handleRestoreChange);
    }

    /**
     *  calcule le nom d'un point via reverse geocoding
     * @param {MapLibreGL.LngLat}
     */
    async #computePointName(coordinates){
        try {
            await Reverse.compute({
                lon : coordinates.lng,
                lat : coordinates.lat
            })
            bResponse = true;
        } catch(err) {
            bResponse = false;
        } finally {
            var coords = Reverse.getCoordinates() || {lon : coordinates.lng, lat : coordinates.lat};
            var address = Reverse.getAddress() || coords.lon.toFixed(6) + ", " + coords.lat.toFixed(6);
            var strAddress = address;
            if (typeof address !== "string") {
                strAddress = "";
                strAddress += (address.number !== "") ? address.number + " " : "";
                strAddress += (address.street !== "") ? address.street + ", " : "";
                strAddress += address.city + ", " + address.postcode;
            }
            return strAddress;
        }
    }

    /**
     *  (re)calcule une étape du tracé a un index donné
     * @param {int} index
     */
    async #computeStep(index) {
        const firstPoint = this.data.points[index];
        const lastPoint = this.data.points[index + 1];
        // saisie libre
        if (this.mode === 0) {
            var distance = new MapLibreGL.LngLat(
                lastPoint.geometry.coordinates[0], lastPoint.geometry.coordinates[1]
            ).distanceTo(
                new MapLibreGL.LngLat(firstPoint.geometry.coordinates[0], firstPoint.geometry.coordinates[1])
            );
            var duration = distance / (4 / 3.6); // 4 km/h divisé par 3.6 pour m/s
            var stepCoords = [
                firstPoint.geometry.coordinates,
                lastPoint.geometry.coordinates
            ];
        // saisie guidée
        } else if (this.mode === 1) {
            var url = this.configuration.api +
            this.configuration.template({
                start: {lng: firstPoint.geometry.coordinates[0], lat: firstPoint.geometry.coordinates[1]},
                end: {lng: lastPoint.geometry.coordinates[0], lat: lastPoint.geometry.coordinates[1]},
                profile: this.transport,
            });
            this.loading = true;
            try {
                var response = await fetch(url, { signal: this.controller.signal });
                var json = await response.json();
            } catch (err) {
                this.loading = false;
                // TODO "Erreur lors de l'ajout du point"
                this.map.on("click", this.handleAddWayPoint);
                return;
            }
            this.loading = false;
            lastPoint.geometry.coordinates = json.geometry.coordinates.slice(-1)[0];
            firstPoint.geometry.coordinates = json.geometry.coordinates[0];
            var stepCoords = json.geometry.coordinates;
            var distance = json.distance;
            var duration = json.duration;

            this.#updateSources();
        }

        var step = {
            type: "Feature",
            geometry: {
                type: "LineString",
                coordinates: stepCoords
            },
            properties: {
                start_name: firstPoint.properties.name,
                end_name: lastPoint.properties.name,
                duration: duration,
                distance: distance,
                dplus: 0,
                dminus: 0,
                id: this.nextStepId,
            }
        }
        this.nextStepId++;

        // Correction du dplus total si on modifie un step déjà enregistré
        let dpluscorrection = 0;
        let dminuscorrection = 0;
        if (index >= this.data.steps.length) {
            this.data.steps.push(step);
        } else {
            dpluscorrection = this.data.steps[index].properties.dplus;
            dminuscorrection = this.data.steps[index].properties.dminus;
            this.data.steps[index] = step;
        }
        this.#updateSources();
        this.data.distance = this.data.steps.reduce( (totalDistance, step) => totalDistance + step.properties.distance, 0);
        this.data.duration = this.data.steps.reduce( (totalDistance, step) => totalDistance + step.properties.duration, 0);

        var lastDPlus = this.elevation.dplus - dpluscorrection;
        var lastDMinus = this.elevation.dminus - dminuscorrection;
        try {
            await this.#updateElevation();
        } catch(err) {
        }
        this.data.steps[index].properties.dplus = this.elevation.dplus - lastDPlus;
        this.data.steps[index].properties.dminus = this.elevation.dminus - lastDMinus;
        if (Globals.backButtonState === "routeDraw") {
            this.__updateRouteInfo(this.data);
        }
    }

    /**
     * met à jour les données d'altitude (profil alti)
     */
    async #updateElevation() {
        const allCoordinates = this.data.steps.map((step) => step.geometry.coordinates).flat();
        this.elevation.setCoordinates(allCoordinates);
        await this.elevation.compute();
        this.data.dplus = this.elevation.dplus;
        this.data.dminus = this.elevation.dminus;
    }

    /**
     * ajoute la source et le layer à la carte pour affichage du tracé
     */
    #addSourcesAndLayers() {
        this.map.addSource(this.configuration.linesource, {
            "type": "geojson",
            "data": {
                type: "FeatureCollection",
                features: this.data.steps,
            }
        });

        RouteDrawLayers["line-casing"].source = this.configuration.linesource;
        RouteDrawLayers["line"].source = this.configuration.linesource;
        this.map.addLayer(RouteDrawLayers["line-casing"]);
        this.map.addLayer(RouteDrawLayers["line"]);

        this.map.addSource(this.configuration.pointsource, {
            "type": "geojson",
            "data": {
                type: "FeatureCollection",
                features: this.data.points,
            }
        });

        RouteDrawLayers["point-casing"].source = this.configuration.pointsource;
        RouteDrawLayers["point"].source = this.configuration.pointsource;
        this.map.addLayer(RouteDrawLayers["point-casing"]);
        this.map.addLayer(RouteDrawLayers["point"]);
    }

    /**
     * met à jour les sources de données pour l'affichage
     */
    #updateSources() {
        var linesource = this.map.getSource(this.configuration.linesource);
        linesource.setData({
            type: "FeatureCollection",
            features: this.data.steps,
        });

        var pointsource = this.map.getSource(this.configuration.pointsource);
        pointsource.setData({
            type: "FeatureCollection",
            features: this.data.points,
        });
    }

    /**
     * enregistre l'état précédent dans l'historique et réinitialise les annulations
     */
    #saveState() {
        DOM.$routeDrawRestore.classList.add("inactive");
        this.dataHistory = this.dataHistory.splice(this.currentHistoryPosition, this.dataHistory.length);
        this.dataHistory.unshift(JSON.parse(JSON.stringify(this.data)));
        this.currentHistoryPosition = 0;
    }

    /**
     * annule le changement précédent
     */
    #cancelChange() {
        if (this.currentHistoryPosition == this.dataHistory.length - 1) {
            return;
        }
        this.currentHistoryPosition++;
        DOM.$routeDrawRestore.classList.remove("inactive");
        this.data = JSON.parse(JSON.stringify(this.dataHistory[this.currentHistoryPosition]));
        this.#updateSources();
        this.__updateRouteInfo(this.data);
        if (this.currentHistoryPosition == this.dataHistory.length - 1) {
            DOM.$routeDrawCancel.classList.add("inactive");
        }
    }

    /**
     * restore le changement précédent
     */
    #restoreChange() {
        if (this.currentHistoryPosition == 0) {
            return
        }
        this.currentHistoryPosition--;
        DOM.$routeDrawCancel.classList.remove("inactive");
        this.data = JSON.parse(JSON.stringify(this.dataHistory[this.currentHistoryPosition]));
        this.#updateSources();
        this.__updateRouteInfo(this.data);
        if (this.currentHistoryPosition == 0) {
            DOM.$routeDrawRestore.classList.add("inactive");
            return;
        }
    }

    /**
     * toggle entre mode suppression du point et mode normal
     * @public
     */
    toggleDelete() {
        if (this.delete == true) {
            this.delete = false;
            DOM.$routeDrawDelete.classList.add("inactive");
            this.map.off("click", RouteDrawLayers["point"].id, this.handleDeletePoint);
            this.map.on("touchstart", RouteDrawLayers["point"].id, this.handleTouchStartPoint);
            this.map.on("click", this.handleAddWayPoint);
            return;
        }
        this.delete = true;
        this.map.off("touchstart", RouteDrawLayers["point"].id, this.handleTouchStartPoint);
        this.map.off("click", this.handleAddWayPoint);
        this.map.on("click", RouteDrawLayers["point"].id, this.handleDeletePoint);
        DOM.$routeDrawDelete.classList.remove("inactive");
    }

    /**
     * toggle entre saisie libre et guidée
     * @public
     */
    toggleMode() {
        if (this.mode == 0) {
            this.mode = 1;
            DOM.$routeDrawMode.querySelector("#routeDrawModeText").innerText = "Saisie guidée";
            return;
        }
        this.mode = 0;
        DOM.$routeDrawMode.querySelector("#routeDrawModeText").innerText = "Saisie libre";
    }

    /**
     * nettoyage du tracé
     * @public
     */
    clear () {
        if (this.delete) {
            this.toggleDelete();
        }
        this.elevation.clear();
        this.#deactivate();
        if (this.loading) {
            this.controller.abort();
            this.controller = new AbortController();
            this.loading = false;
        }
        this.data = {
            duration: 0,
            distance: 0,
            dplus: 0,
            dminus: 0,
            points: [],
            steps: [],
        }
        this.dataHistory = [];
        this.__updateRouteInfo(this.data);
        if (this.map.getLayer(RouteDrawLayers["line"].id)) {
            this.map.removeLayer(RouteDrawLayers["line"].id);
            this.map.removeLayer(RouteDrawLayers["line-casing"].id);
        }
        if (this.map.getSource(this.configuration.linesource)) {
            this.map.removeSource(this.configuration.linesource);
        }
        if (this.map.getLayer(RouteDrawLayers["point"].id)) {
            this.map.removeLayer(RouteDrawLayers["point"].id);
            this.map.removeLayer(RouteDrawLayers["point-casing"].id);
        }
        if (this.map.getSource(this.configuration.pointsource)) {
            this.map.removeSource(this.configuration.pointsource);
        }
    }

    /**
     * affiche le menu des résultats du calcul
     * @public
     */
    show () {
        Globals.menu.open("routeDraw");
    }

    /**
     * ferme le menu des résultats du calcul
     * @public
     */
    hide () {
        Globals.menu.close("routeDraw");
    }

    /**
     * affiche la popup d'aide
     * @public
     */
    showHelpPopup() {
        // on supprime la popup
        if (this.popup) {
            this.popup.remove();
            this.popup = null;
        }

        // template litteral
        const popupContent = `
        <div id="routeDrawHelpPopup">
            <div class="divPositionTitle">Mode de saisie</div>
            <div class="divPopupClose" onclick="onCloseRouteDrawHelpPopup(event)"></div>
            <div class="divPopupContent">
                La saisie d'itinéraire peut se faire selon deux modes pour les itinéraires pédestres :<br/>
                • Saisie guidée : Le chemin entre deux points saisis suivra le réseau des routes et chemins.<br/>
                • Saisie libre : Le chemin sera constitué de lignes droites entre les points saisis.<br/>
                Il est possible de faire un itinéraire pédestre combinant les deux modes de saisie. <br/><br/>
                Pour les itinéraires en véhicule, seule la saisie guidée est disponible.
            </div>
        </div>
        `;
        var self = this;
        window.onCloseRouteDrawHelpPopup = (e) => {
            self.popup.remove();
        }

        // centre de la carte
        var center = this.map.getCenter();
        // position de la popup
        let markerHeight = 0, markerRadius = 10, linearOffset = 25;
        var popupOffsets = {
            'top': [0, 0],
            'top-left': [0, 0],
            'top-right': [0, 0],
            'bottom': [0, -markerHeight],
            'bottom-left': [linearOffset, (markerHeight - markerRadius + linearOffset) * -1],
            'bottom-right': [-linearOffset, (markerHeight - markerRadius + linearOffset) * -1],
            'left': [markerRadius, (markerHeight - markerRadius) * -1],
            'right': [-markerRadius, (markerHeight - markerRadius) * -1]
        };
        // ouverture d'une popup
        this.popup = new MapLibreGL.Popup({
            offset: popupOffsets,
            className: "routeDrawHelpPopup",
            closeOnClick: true,
            closeOnMove: true,
            closeButton: false
        })
        .setLngLat(center)
        .setHTML(popupContent)
        .setMaxWidth("300px")
        .addTo(this.map);
    }

}

// mixins
Object.assign(RouteDraw.prototype, RouteDrawDOM);

export default RouteDraw;
