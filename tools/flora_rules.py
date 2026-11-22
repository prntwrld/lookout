"""What counts as a wildflower for the pack: flowering plants you'd stop to look at, without the grasses,
sedges and rushes, the trees and shrubs, and the pond weeds. Edit these lists to widen or narrow the pack."""

NOT_FAMILIES = {
    "Poaceae", "Cyperaceae", "Juncaceae", "Typhaceae", "Potamogetonaceae", "Zosteraceae", "Ruppiaceae",
    "Salicaceae", "Betulaceae", "Fagaceae", "Sapindaceae", "Oleaceae", "Grossulariaceae", "Rhamnaceae",
    "Viburnaceae", "Adoxaceae", "Celastraceae", "Anacardiaceae", "Hydrangeaceae", "Elaeagnaceae", "Myricaceae",
    "Juglandaceae", "Ulmaceae", "Urticaceae", "Amaranthaceae", "Haloragaceae", "Ceratophyllaceae",
    "Hydrocharitaceae", "Juncaginaceae", "Scheuchzeriaceae", "Lemnaceae", "Garryaceae", "Cupressaceae", "Pinaceae",
}
NOT_GENERA = {
    # shrubs and trees in families that are otherwise wildflowers
    "Rubus", "Rosa", "Amelanchier", "Spiraea", "Holodiscus", "Oemleria", "Prunus", "Crataegus", "Sorbus", "Malus",
    "Physocarpus", "Purshia", "Cercocarpus", "Dasiphora", "Vaccinium", "Gaultheria", "Arctostaphylos", "Menziesia",
    "Rhododendron", "Arbutus", "Ledum", "Symphoricarpos", "Lonicera", "Berberis", "Mahonia", "Oplopanax", "Ceanothus",
    "Artemisia", "Ericameria", "Chrysothamnus", "Baccharis", "Tetradymia", "Cytisus", "Ulex", "Acer", "Paxistima",
    "Sambucus", "Elliottia", "Philadelphus", "Shepherdia", "Lupinus_arboreus", "Ribes", "Salix", "Toxicodendron", "Corylus",
    # mistletoes, duckweeds and other water plants
    "Arceuthobium", "Phoradendron", "Lemna", "Spirodela", "Wolffia", "Callitriche", "Hippuris", "Myriophyllum",
    "Elodea", "Sparganium", "Zostera", "Ruppia", "Najas", "Utricularia", "Alisma",
}
NOT_SPECIES = {"Cornus sericea", "Cornus nuttallii", "Cornus alba", "Rhus glabra", "Eriogonum compositum_shrub"}


def is_wildflower(name, family):
    genus = name.split()[0]
    return family not in NOT_FAMILIES and genus not in NOT_GENERA and name not in NOT_SPECIES
