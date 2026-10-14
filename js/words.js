/*!
 * Word Bloom — curated dictionary
 * ---------------------------------------------------------------------------
 * Deliberately a CURATED list, not a raw dictionary dump. Obscure words make
 * anagram puzzles feel unfair: the player cannot guess a word they have never
 * seen. Every word here is common English that a casual player can plausibly
 * find. Expanding this list is the single highest-leverage content task
 * (see README "Scaling content").
 *
 * Kept dependency-free and dual-environment (browser + Node) so the level
 * generator can be unit-tested headlessly.
 */
(function (root) {
  'use strict';

  var RAW = [
    /* ---- 3 letters ---- */
    'ace act add age ago aid ail aim air ale all and ant ape apt arc are arm art ash ask ate awe axe',
    'bad bag ban bar bat bay bed bee beg bet bid big bin bit boa bog boo bow box boy bud bug bun bus but buy',
    'cab cad can cap car cat cob cod cog con coo cop cot cow coy cry cub cue cup cut',
    'dab dad dam day den dew did die dig dim din dip doe dog don dot dry dub dud due dug duo dye',
    'ear eat eel egg ego elf elk elm end era eve eye',
    'fad fan far fat fax fed fee few fib fig fin fir fit fix flu fly foe fog for fox fry fun fur',
    'gag gal gap gas gel gem get gig gin got gum gun gut gym',
    'had ham has hat hay hem hen her hey hid him hip his hit hoe hog hop hot how hub hue hug hum hut',
    'ice icy ilk ill imp ink inn ion ire irk its ivy',
    'jab jag jam jar jaw jay jet jig job jog jot joy jug jut',
    'keg key kid kin kit',
    'lab lad lag lap law lay led leg let lid lie lip lit lob log lot low',
    'mad man map mar mat maw may men met mid mix mob mod mom mop mud mug mum',
    'nab nag nap net new nib nil nip nod nor not now nun nut',
    'oak oar oat odd ode off oil old one opt orb ore our out owe owl own',
    'pad pal pan par pat paw pay pea peg pen pep per pet pew pie pig pin pit ply pod poi pop pot pro pry pub pug pun pup put',
    'rag ram ran rap rat raw ray red rib rid rig rim rip rob rod roe rot row rub rug rum run rut rye',
    'sac sad sag sap sat saw say sea see set sew she shy sin sip sir sit six ski sky sly sob sod son sop sow soy spa spy sty sub sue sum sun sup',
    'tab tad tag tan tap tar tax tea ten the thy tic tie tin tip toe tog ton too top tot tow toy try tub tug two',
    'urn use van vat vet via vie vow',
    'wad wag war was wax way web wed wee wet who why wig win wit woe wok won woo wow',
    'yak yam yap yes yet yew you',
    'zap zip zoo',

    /* ---- 4 letters ---- */
    'able ache acid aged aide ally also alto area army atom aunt auto away axis',
    'baby back bake bald ball band bank bare barn base bath beam bean bear beat beef been beer bell belt bend best bike bill bird bite blue boat body boil bold bolt bomb bond bone book boom boot bore born boss both bowl brew brow bulk bull burn bury bush bust busy',
    'cake calf call calm came camp cane cape card care cart case cash cast cave cell cent chat chef chin chip chop cite city clam clan clap claw clay clip club clue coal coat code coil coin cold colt comb come cone cook cool cope copy cord core cork corn cost cozy coup cove crab crew crib crop crow cube cuff cult curb cure curl cute',
    'dare dark dart dash data date dawn deal dean dear debt deck deed deem deep deer defy demo dent deny desk dial dice diet dime dine dire dirt disc dish disk dive dock does dole doll dome done doom door dose dove down doze drab drag draw drew drip drop drum dual duck duel dull dumb dump dune dusk dust duty',
    'each earl earn ease east easy echo edge edit else emit envy epic even ever evil exam exit',
    'face fact fade fail fair fake fall fame fang farm fast fate fawn fear feat feed feel fell felt fern feud file fill film find fine fire firm fish fist five flag flap flat flaw flea fled flee flew flex flip flop flow foam foil fold folk fond font food fool foot ford fore fork form fort foul four fowl free fret frog from fuel full fume fund fuse fuss',
    'gain gala gale game gang gape gasp gate gave gaze gear gene gift gild girl give glad glee glen glow glue goal goat goes gold golf gone gong good gown grab gram gray grew grid grim grin grip grit grow gulf gull gulp guru gush gust guts',
    'hail hair half hall halo halt hand hang hare harm harp hate haul have hawk haze head heal heap hear heat heed heel heir held helm help herb herd here hero hide high hike hill hint hire hive hold hole holy home hone hood hoof hook hoop hope horn hose host hour huge hull hunt hurl hurt hush husk hymn',
    'icon idea idle idol inch into iron isle item',
    'jack jade jail jazz jeep jest join joke jolt jump junk jury just',
    'keen keep kept kick kiln kind king kiss kite knee knit knob knot know',
    'lace lack laid lair lake lamb lame lamp land lane last late lava lawn lazy lead leaf leak lean leap left lend lens lent less liar lice lick lied life lift like limb lime line link lint lion list live load loaf loan lobe lock loft logo lone long look loop lord lore lose loss lost loud love luck lump lung lure lurk lush lute',
    'made mail main make male mall malt mane many mare mark mash mask mass mast mate math maze meal mean meat meek meet meld melt memo mend menu mere mesh mess mice mild mile milk mill mind mine mint mist mode mold mole monk mood moon moor more moss most moth move much mule muse mush must mute myth',
    'nail name nape navy near neat neck need neon nest news next nice nick nine node none noon nose note noun nova numb',
    'oath obey odds okay omen omit once only onto open oral oval oven over',
    'pace pack pact page paid pail pain pair pale palm pane pant park part pass past path pave pawn peak pear peat peck peek peel peep peer pelt perk pest pier pile pill pine pink pipe plan play plea plot plow ploy plug plum plus poem poet pole poll polo pond pony pool poor pope pore pork port pose posh post pour pout pray prep prey prim prod prop pull pulp pump punk pure push',
    'quay quit quiz',
    'race rack raft rage raid rail rain rake ramp rang rank rant rare rash rate rave read real ream reap rear reed reef reek reel rein rely rent rest rice rich ride rife rift ring riot ripe rise risk rite road roam roar robe rock rode role roll roof rook room root rope rose rosy rout rove rude ruin rule rump rune rung rush rust',
    'safe sage said sail sake sale salt same sand sane sang sank sash save scan scar seal seam seat sect seed seek seem seen self sell semi send sent ship shoe shop shot show shun shut sick side sift sigh sign silk silo sing sink site size skew skid skim skin skip slab slam slap sled slid slim slip slit slot slow slug slum smog snag snap snip snow soak soap soar sock soda sofa soft soil sold sole solo some song soon sore sort soul soup sour span spar spat spin spur stab stag star stay stem step stew stir stop stow stub stud stun such suit sung sunk sure surf swan swap swim',
    'tack tail take tale talk tall tame tank tape tart task taut teak teal team tear tell tend tent term test text than that thaw them then they thin this thud thug thus tick tide tidy tier tile till tilt time tiny tire toad toil told toll tomb tone tool torn toss tour town trap tray tree trek trim trio trip trod true tube tuck tuna tune turf turn tusk twin type',
    'ugly undo unit unto upon urge used user',
    'vain vale vary vase vast veal veer veil vein vent verb very vest veto vial vice view vile vine visa void volt vote',
    'wade wage wait wake walk wall wand wane want ward ware warm warn warp wart wary wash wasp wave waxy weak wear weed week weep well went were west what when whim whip whom wick wide wife wild will wilt wind wine wing wink wipe wire wise wish wisp with wolf wood wool word wore work worm worn wrap wren',
    'yard yarn yawn year yell yoga yolk your',
    'zeal zero zest zinc zone zoom',

    /* ---- 5 letters ---- */
    'about above abuse actor acute admit adopt adult after again agent agree ahead alarm album alert alien align alike alive allow alone along alter amber among ample angel anger angle angry ankle apart apple apply arena argue arise armor aroma array arrow aside asset atlas audio audit avoid awake award aware',
    'baker banjo barge basic basin batch beach beard beast began begin being belly below bench berry birth black blade blame bland blank blast blaze bleak blend bless blind block blood bloom blown blues blunt blush board boast bonus boost booth bound brain brand brass brave bread break breed brick bride brief bring brink brisk broad broke brook broom brown brush build built bunch bunny burst',
    'cabin cable camel candy canoe cargo carol carry carve catch cause cease chain chair chalk charm chart chase cheap cheat check cheek cheer chess chest chief child chill choir chose chunk cider cigar civic civil claim clash clasp class clean clear clerk click cliff climb clock close cloth cloud clown coach coast cobra cocoa colon color comet comic coral couch cough could count court cover crack craft crane crank crash crate crawl crazy cream creek creep crest crime crisp cross crowd crown crude cruel crush crust curly curve cycle',
    'daily dairy dance dated dealt death debut decay decor delay delta dense depth derby diary dirty ditch diver dizzy dodge doing donor doubt dough dozen draft drain drama drank dream dress dried drift drill drink drive drove drown drunk dryer dwell',
    'eager eagle early earth easel eaten ebony eight elbow elder elect elite email ember empty enact enemy enjoy enter entry equal equip erase error essay event every exact excel exile exist extra',
    'fable faced faint fairy faith false fancy fatal fault favor feast fence ferry fever fiber field fiery fifth fifty fight final finch first flame flash fleet flesh flint float flock flood floor flour flown fluid flush flute focal focus foggy force forge forth forty forum found frame fraud fresh fried front frost fruit fully funny',
    'gauge geese genre ghost giant given giver glass gleam glide globe glory glove going goose grace grade grain grand grant grape graph grasp grass grave gravy great greed green greet grief grill grind groan groom gross group grove growl grown guard guess guest guide guild guilt',
    'habit hairy handy happy harsh haste hatch haunt haven havoc heart heavy hedge hello hobby hoist honey honor horse hotel hound house hover human humid humor hurry husky',
    'ideal image imply index inner input irony issue ivory',
    'jelly jewel joint joker judge juice jumbo',
    'kneel knife knock known',
    'label labor laden lance large laser latch later laugh layer learn lease least leave legal lemon level lever light limit linen liner lobby local lodge logic loose lorry loser lower loyal lucky lunar lunch lying',
    'magic major maker mango maple march marsh match mayor medal media melon mercy merge merit merry metal meter midst miles minor minus mixer model moist money month moral motor mound mount mourn mouse mouth movie muddy music',
    'naive naked nasty naval nerve never newly night noble noise north notch noted novel nurse',
    'oasis ocean offer often olive onion opera orbit order organ other otter ounce outer owner oxide ozone',
    'paint panel panic paper party pasta patch pause peace peach pearl pedal penny perch pilot pinch pitch pixel pizza place plain plane plant plate plaza plead pluck point polar porch pouch pound power press price pride prime print prior prize probe prone proof proud prove prowl prune pulse punch pupil puppy purse',
    'queen query quest queue quick quiet quilt quota quote',
    'radar radio raise rally ranch range rapid ratio raven reach react ready realm rebel refer reign relax relay renew repay reply rider ridge rifle right rigid rinse rival river roast robin robot rocky rogue rough round route royal rugby ruler rumor rural rusty',
    'sadly saint salad salon salsa sandy sauce sauna saved scale scalp scarf scene scent scoop scope score scout scrap screw scrub seize sense serum serve seven shade shady shaft shake shall shame shape share shark sharp shave shear sheep sheet shelf shell shift shine shiny shirt shock shoot shore short shout shown shrub sight silky silly since sixth sixty skate skill skirt slave sleep sleet slice slide slime slope small smart smash smell smile smoke snack snake sneak solar solid solve sorry sound south space spade spare spark speak spear speed spell spend spent spice spike spill spine spite split spoke spoon sport spout spray spree squad stack staff stage stain stair stake stale stalk stall stamp stand stare stark start state steak steal steam steel steep steer stern stick stiff still sting stock stole stone stood stool store storm story stove strap straw stray strip stuck study stuff stump style sugar suite sunny super surge swamp swarm swear sweat sweep sweet swell swift swing sword',
    'table taken tally tango taste teach tempo tenor tense tenth thank theft their theme there these thick thief thigh thing think third thorn those three threw throw thumb tiger tight timer tired title toast today token tonic tooth topic torch total totem touch tough towel tower toxic trace track trade trail train trait tramp trash treat trend trial tribe trick tried troop trout truck truly trunk trust truth tulip tumor tuned twist',
    'uncle under union unite unity until upper upset urban usage usual',
    'valid value valve vapor vault verse video vigor villa vinyl virus visit vital vivid vocal voice voter',
    'wagon waist waste watch water weary weave wedge weigh weird whale wheat wheel where which while whine whirl whisk white whole whose widow width wield windy witch woman world worry worse worst worth would wound wrist write wrong wrote',
    'yacht yeast yield young youth',
    'zebra',

    /* ---- 6 letters ---- */
    'action advice agency almost always amount animal annual answer anyone appeal around arrive artist aspect attack attend author autumn',
    'banana banner barrel basket battle beauty become before behave behind belief belong beside better beyond bishop bitter blouse border borrow bottle bottom bounce branch breeze bridge bright broken bronze bubble bucket budget bullet bundle bureau butter button',
    'camera candle canvas carbon career carpet carrot castle casual cattle celery cellar cement center cereal chance change charge cheese cherry choice choose chorus church cinema circle circus client coffee collar colony column combat comedy coming common cotton county couple course cousin create credit crisis critic custom',
    'damage danger debate decide defeat defend define degree delete demand depend derive desert design desire detail detect device differ dinner direct doctor dollar domain double dragon drawer driver during',
    'editor effect effort eighty either eleven employ enable ending energy engage engine enough ensure escape estate ethnic evolve excess expand expect expert export extend',
    'fabric factor family farmer faster father fellow female figure filter finger finish fiscal flavor flight flower follow forest forget formal format former foster freeze fringe frozen future',
    'galaxy garage garden gather gentle ginger glance global golden govern ground growth guitar',
    'hammer handle happen harbor hardly health height helmet hidden holder hollow honest horror hunger hunter',
    'impact import income indeed infant inform injury insect inside insist intend invest island',
    'jacket jungle junior',
    'keeper kernel kettle kidney',
    'ladder latest launch lawyer leader league lesson letter likely liquid listen little lively living lonely loving luxury',
    'magnet manner marble margin marine market master matter mature meadow medium member memory mental method middle minute mirror mobile modern modest moment monkey mother motion murder muscle museum mutual myself',
    'narrow nation native nature nearby nearly needle nephew nickel nobody normal notice notion number',
    'object obtain occupy office online option orange origin outfit output oxygen',
    'packet palace parent parish patent patrol peanut pencil people pepper period permit person phrase picnic picture pillow pirate planet player please pledge plenty pocket poetry police policy polish poorly popular porter potato powder praise prayer prefer pretty prince prison profit prompt proper proven public puppet purple pursue puzzle',
    'rabbit racing random rather rating reader really reason recall recent record reduce reform regard region regret reject relate relief remain remark remedy remote remove render repair repeat report rescue resist resort result retail retire return reveal review reward ribbon riding ripple rising ritual rocket rookie rubber rugged runner',
    'sacred safety salary salmon sample school screen script search season second secret sector secure seeing seldom select seller senate senior series settle severe shadow shaken should signal silent silver simple simply single sister slight smooth soccer social socket softly solved sorrow source speech sphere spirit splash spouse spread spring sprout square squash stable stance staple statue status steady sticky stolen strain strand stream street stress strict strike string strive stroke strong struck studio stupid submit subtle sudden suffer summer summit sunset superb supply surely survey switch symbol system',
    'tablet tackle tailor talent target tavern temple tender tennis theory thirty though thread threat thrill throat throne thrown thrust ticket timber timely tissue tomato tongue toward tragic travel treaty tremor trench trendy tricky triple trophy tropic tunnel turkey turtle twelve twenty',
    'unfair unfold unique unless unlike unlock unpaid update upheld urgent useful',
    'valley vanish vendor verbal verify vessel victim viewer violet virgin virtue vision visual volume voyage',
    'walnut wander wealth weapon weekly weight willow window winner winter wisdom wonder wooden worker worthy writer',
    'yellow',

    /* ---- 7 letters ---- */
    'ability absence academy account achieve acquire address advance against airline already ancient another anxiety article',
    'balance battery because benefit between billion brother',
    'cabinet captain capture certain chamber chapter charity chicken chimney circuit classic climate combine comfort command comment company compare compass compete complex concern conduct confirm connect consist contact contain content contest context control convert correct cottage council country crystal culture curious current cushion',
    'declare default defense deficit deliver density deposit desktop despite destroy develop digital discuss disease dismiss display dispute distant diverse dolphin doorway drawing destiny',
    'economy edition educate elderly element embrace emotion enhance evening examine example exhibit explain explore extreme',
    'factory faculty failure fashion feature federal feeling fifteen finance finding fitness foreign forever fortune forward freedom further',
    'gallery general genetic genuine gesture grammar granted gravity greater grocery',
    'habitat harvest heading healthy hearing heavily himself history holiday horizon hostage housing however hundred husband',
    'imagine impress improve include initial inquiry insight inspire install instant instead interest interior invalid involve',
    'journey justice',
    'kingdom kitchen',
    'landing largely leather lecture license limited',
    'machine manager mandate mankind massive maximum meaning measure medical mention message mineral minimum mission mistake mixture monarch monitor monthly morning mustard mystery',
    'natural neither nervous network nothing',
    'observe obvious officer operate opinion organic outcome outdoor outlook outside overall',
    'package parking partial partner passage patient pattern penalty pending pension percent perfect perform perhaps persist picture pioneer plastic popular portion poverty precise predict premier premium prepare present prevent primary printer private problem process produce product profile program project promote protect protein provide publish purpose',
    'quality quarter quickly',
    'rainbow readily reality realize receipt receive recover reflect regular related release replace request require reserve resolve respect respond restore retreat revenue reverse roughly routine royalty',
    'scanner scholar science scratch section segment serious service session setting several shallow shelter shortly sibling similar sincere skilled society soldier somehow someone speaker special sponsor station storage stretch student subject succeed success suggest summary support supreme surface surgeon surplus surprise survive suspend sustain symptom',
    'teacher suspect tension theater therapy thought thunder tobacco tourist traffic tragedy trainer transit trouble trustee tuition twilight typical',
    'uniform unknown unusual upgrade utility',
    'variety vehicle venture version veteran victory village vintage violent visible visitor voltage',
    'waiting walking warning weather wedding weekend welcome western willing without witness working workout writing written',
    'younger'
  ].join(' ');

  var WORDS = RAW.split(/\s+/)
    .map(function (w) { return w.trim().toUpperCase(); })
    .filter(function (w) { return /^[A-Z]{3,7}$/.test(w); });

  // De-duplicate while preserving order.
  var seen = Object.create(null);
  var UNIQUE = [];
  for (var i = 0; i < WORDS.length; i++) {
    if (!seen[WORDS[i]]) { seen[WORDS[i]] = true; UNIQUE.push(WORDS[i]); }
  }

  var WORD_SET = Object.create(null);
  for (var j = 0; j < UNIQUE.length; j++) WORD_SET[UNIQUE[j]] = true;

  /** Letter -> count map for a word. */
  function letterCounts(word) {
    var m = Object.create(null);
    for (var i = 0; i < word.length; i++) {
      var c = word[i];
      m[c] = (m[c] || 0) + 1;
    }
    return m;
  }

  /** True when `word` can be spelled using only the letters available in `pool`. */
  function fitsPool(word, pool) {
    var wc = letterCounts(word);
    for (var c in wc) {
      if ((pool[c] || 0) < wc[c]) return false;
    }
    return true;
  }

  root.WordBloom = root.WordBloom || {};
  root.WordBloom.words = {
    all: UNIQUE,
    set: WORD_SET,
    has: function (w) { return !!WORD_SET[String(w).toUpperCase()]; },
    letterCounts: letterCounts,
    fitsPool: fitsPool,
    count: UNIQUE.length
  };
})(typeof window !== 'undefined' ? window : globalThis);
