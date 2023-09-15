import maplibregl from "maplibre-gl";
import MapLibreGlDirections from "@maplibre/maplibre-gl-directions";
import DirectionsDOM from "./directions-dom";

import MenuDisplay from "../menu-display";
import DOM from "../dom";
import Geocode from "../geocode";
import DirectionsResults from "./directions-results";

/**
 * Interface du contrôle sur le calcul d'itineraire
 * @module Directions
 * @todo gestion des styles
 * @todo gestion de l'état du contrôle (local storage)
 * @todo monter le service IGN
 * @todo ajouter "Ma Position" par defaut
 * @todo ajouter les fonctionnalités : cf. DOM
 */
class Directions {
    /**
     * constructeur
     * @constructs
     * @param {*} map 
     * @param {*} options 
     */
    constructor (map, options) {
        this.options = options || {
            target : null,
            configuration : {},
            style : {}
        };

        // TODO styles personnalisés
        //   cf. https://maplibre.org/maplibre-gl-directions/#/examples/restyling

        // configuration du service
        //   cf. https://project-osrm.org/docs/v5.24.0/api/#
        //   ex. https://map.project-osrm.org/
        this.configuration = this.options.configuration || {
            api: "https://router.project-osrm.org/route/v1",
            profile: "driving",
            requestOptions: {},
            requestTimeout: null,
            makePostRequest: false,
            sourceName: "maplibre-gl-directions",
            pointsScalingFactor: 1,
            linesScalingFactor: 1,
            sensitiveWaypointLayers: [
                "maplibre-gl-directions-waypoint", 
                "maplibre-gl-directions-waypoint-casing"
            ],
            sensitiveSnappointLayers: [
                "maplibre-gl-directions-snappoint", 
                "maplibre-gl-directions-snappoint-casing"
            ],
            sensitiveRoutelineLayers: [
                "maplibre-gl-directions-routeline", 
                "maplibre-gl-directions-routeline-casing"
            ],
            sensitiveAltRoutelineLayers: [
                "maplibre-gl-directions-alt-routeline", 
                "maplibre-gl-directions-alt-routeline-casing"
            ],
            dragThreshold: 10,
            refreshOnMove: false,
            bearings: false
        };

        // résultats du calcul
        this.results = null;

        // carte
        this.map = map;

        // objet
        this.obj = new MapLibreGlDirections(this.map, this.configuration);

        // INFO sans interaction par défaut !
        // > choix d'activer via la méthode publique...
        this.obj.interactive = false;

        // rendu graphique
        this.render();
    }

    /**
     * creation de l'interface principale
     * @public
     */
    render () {
        var target = this.options.target || DOM.$directionsWindow;
        if (!target) {
            console.warn();
            return;
        }

        var container = this.getContainer();
        if (!container) {
            console.warn();
            return;
        }
        
        // ajout du container
        target.appendChild(container);
    }

    /**
     * requête au service
     * @param {*} settings
     * @public
     */
    compute (settings) {
        console.log(settings);
        // nettoyage de l'ancien parcours !
        this.obj.clear();
        // Les valeurs sont à retranscrire en options du service utilisé
        // - transport : ex. voiture vers l'option 'profile:driving'
        // - computation
        // - locations
        if (settings.transport) {
            // mettre en place les differents types de profile si le service le permet !
            switch (settings.transport) {
                case "Pieton":
                case "Voiture":
                    this.configuration.profile = "driving";
                    break;
            
                default:
                    break;
            }
        }
        if (settings.computation) {
            // mettre en place le mode calcul si le service le permet !
            var code = settings.computation;
            var message = "";
            switch (code) {
                case "Shortest":
                    message = "Itinéraire le plus court";
                    break;
                case "Fastest":
                    message = "Itinéraire le plus rapide";
                    break;
            
                default:
                    break;
            }
            settings.computation = {
                code : code,
                message : message
            };
        }
        if (settings.locations && settings.locations.length) {
            try {
                // les coordonnées sont en lon / lat en WGS84G
                var start = JSON.parse(settings.locations[0]);
                var end = JSON.parse(settings.locations[settings.locations.length - 1]);
                if (start && end) {
                    this.obj.addWaypoint(start);
                    this.obj.addWaypoint(end);
                    this.map.fitBounds([start, end], {
                        padding : 20
                    });
                }
            } catch (e) {
                // catching des exceptions JSON
                console.error(e);
                return;
            }
        }

        // events
        this.obj.on("fetchroutesstart", (e) => {
            // TODO utilisation d'une patience...
        });
        this.obj.on("fetchroutesend", (e) => {
            console.log(e);
            // affichage du menu du parcours : 
            // - résumé
            // - détails
            // on transmet les données (en fonction du service) au composant DOM 
            // pour l'affichage :
            // ex.
            // e.data.routes[0] : { 
            //    distance, 
            //    duration, 
            //    geometry, 
            //    legs[]
            //  }
            if (e.data.code === "Ok") {
                this.results = new DirectionsResults(this.map, null, { 
                    duration : e.data.routes[0].duration || "",
                    distance : e.data.routes[0].distance || "",
                    transport : settings.transport,
                    computation : settings.computation.message,
                    instructions : []
                });
                this.results.show();
            }
        });
    }

    /**
     * activation du mode interaction
     * @param {*} status 
     * @public
     */
    interactive (status) {
        this.obj.interactive = status;
    }

    /**
     * nettoyage du tracé
     * @public
     */
    clear () {
        this.obj.clear();
    }

    ////////////////////////////////////////////
    // autres méthodes...
    ////////////////////////////////////////////
    /**
     * listener issu du dom sur l'interface du menu 'search'
     * @param {*} e 
     * @see MenuDisplay.openSearchDirections()
     * @see MenuDisplay.closeSearchDirections
     * @see Geocode
     */
    onOpenSearchLocation (e) {
        // on ouvre le menu
        MenuDisplay.openSearchDirections();
        
        // on transmet d'où vient la demande de location : 
        // - point de départ,
        // - arrivée,
        // - étape
        var target = e.target;

        // les handler sur 
        // - le geocodage
        // - la fermeture du menu
        // - le nettoyage des ecouteurs
        function setLocation (e) {
            // on ferme le menu
            MenuDisplay.closeSearchDirections();
            // on enregistre dans le DOM :
            // - les coordonnées en WGS84G soit lon / lat !
            // - la reponse du geocodage
            target.dataset.coordinates = "[" + e.detail.coordinates.lon + "," + e.detail.coordinates.lat + "]";
            target.value = e.detail.text;
            // on supprime les écouteurs
            cleanListeners();
        }
        function cleanLocation (e) {
            target.dataset.coordinates = "";
            target.value = "";
            cleanListeners();
        }
        function cleanListeners () {
            DOM.$closeSearch.removeEventListener("click", cleanLocation);
            Geocode.target.removeEventListener("search", setLocation)
        }

        // abonnement au geocodage
        Geocode.target.addEventListener("search", setLocation);

        // abonnement au bouton de fermeture du menu
        DOM.$closeSearch.addEventListener("click", cleanLocation);
    }
}

// mixins
Object.assign(Directions.prototype, DirectionsDOM);

export default Directions;