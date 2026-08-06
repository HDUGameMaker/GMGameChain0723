# 炼金的三重镜像——《翠玉录》《Noita》《药剂工艺：炼金模拟器》完全整理

## 摘要

本报告对三个与「炼金」深度绑定的对象做了一次穷尽式整理：**《翠玉录》（Emerald Tablet）**——西方炼金术最根本的文本，十三条箴言确立了「上下对应」「太一生万物」「分离与循环」「伟大工作」四大支柱；**《Noita》**——以逐像素物理模拟为骨架的 Roguelike，其炼金系统由「已知反应表＋随世界种子随机生成的两大三元配方（活性混合物质、炼金溶液）＋金属嬗变链＋真菌转换」构成，并把点金之水（Draught of Midas）与万能灵药（Lively Concoction）这一对赫尔墨斯炼金术的终极追求直接做进了游戏机制；**《药剂工艺：炼金模拟器》（Potion Craft: Alchemist Simulator）**——把炼金术抽象为「地图航行＋原料罗盘＋研磨搅拌加热」的完整工艺流程，其终局内容完整复刻了伟大工作的四阶段：黑化（Nigredo）→白化（Albedo）→黄化（Citrinitas）→红化（Rubedo）→贤者之石（Philosopher's Stone），并以五种魔法盐收束全局。报告依次整理三者的核心理念、指导思想、配方体系与操作流程，最后给出三者的对照框架：文本给思想、Noita 给涌现、药剂工艺给流程，三者合观即是炼金术从理念到模拟再到系统化的完整谱系。

---

## 一、《翠玉录》：炼金术的理念之源

### 1.1 文献源流：从阿拉伯密室到拉丁欧洲

《翠玉录》是一部托名「三重伟大的赫尔墨斯」（Hermes Trismegistus）的简短隐晦文本，被中世纪伊斯兰世界乃至其后欧洲炼金术与赫尔墨斯传统奉为奠基之作；在科学革命之前，炼金术士们相信它以压缩的形式记述了关于自然的教导——宇宙的结构、实在的本性、转化与变化的过程，以及哲人之石的达成  [(Britannica)](https://www.britannica.com/topic/Emerald-Tablet) 。赫尔墨斯这一形象本身就是埃及智慧之神托特（Thoth）与希腊神赫尔墨斯的融合  [(Britannica)](https://www.britannica.com/topic/Emerald-Tablet) ，而在中文语境的通行叙述里，《翠玉录》之于赫尔墨斯哲学，「有如《道德经》对于道家和炼丹的地位」，中世纪炼金术士的工作间里都会悬挂一份翠玉录的文字，作为他们所需的最终指导  [(百度百科)](https://baike.baidu.com/item/%E7%BF%A0%E7%8E%89%E5%BD%95/4579712) 。

围绕其发现过程流传着诸多传说：亚伯拉罕之妻撒拉在希伯仑附近发现、提亚纳的阿波罗尼俄斯（Apollonius of Tyana）在赫尔墨斯雕像下的洞穴中发现、亚历山大大帝在阿蒙神谕处之旅中寻得，等等，但没有任何可靠证据支持其早于中世纪阿拉伯时期  [(Britannica)](https://www.britannica.com/topic/Emerald-Tablet) 。学术上可追溯的最早版本出现在阿拉伯文著作《创造之秘书》（Kitāb Sirr al-Khalīqa，全名《创造之秘与自然之术》）中，该书可能成书于公元 650 年至 833 年（马蒙哈里发时期）之间；另一个早期阿拉伯版本附于托名贾比尔·伊本·哈扬（Jābir ibn Hayyān）的《第二基础元素之书》（Kitāb Ustuqus al-Uss al-Thanī）  [(Amazon Singapore)](https://www.amazon.sg/Emerald-Tablet-Hermes-Smaragdine-Smaragdina/dp/1977921825) 。它西传的路径大致是：先被收入伪亚里士多德著作《秘密之秘》（Kitāb Sirr al-Asrār／Secretum Secretorum），由塞维利亚的约翰内斯（Johannes Hispalensis）约 1140 年、的黎波里的菲利普（Philip of Tripoli）约 1243 年译成拉丁文，此后译本、诠释与注疏层出不穷  [(Amazon Singapore)](https://www.amazon.sg/Emerald-Tablet-Hermes-Smaragdine-Smaragdina/dp/1977921825) 。十四世纪，炼金术士奥尔托拉努斯（Ortolanus）为「赫尔墨斯之秘」写下影响深远的长篇注疏，十五世纪起大量附有该注疏的翠玉录抄本流传  [(spiritmaji.com)](https://files.spiritmaji.com/books/Hermetics/emeraldtablet.pdf) 。文艺复兴之后，牛顿亲手翻译过它，布拉瓦茨基夫人将其推广为秘教灵性文本，荣格则把它重新解读为心理过程的象征性描述  [(Britannica)](https://www.britannica.com/topic/Emerald-Tablet) 。

### 1.2 全文整理：十三条箴言

《翠玉录》全文由一段「洞穴得版」的引子和十三条箴言构成。下表以通行的牛顿英译本为底本逐条对照整理，并附解读  [(百度百科)](https://baike.baidu.com/item/%E7%BF%A0%E7%8E%89%E5%BD%95/4579712) 。

| 序 | 中文 | 英文（牛顿译本） | 解读 |
|---|---|---|---|
| 引 | 当我走进洞穴，我看到了一块翠玉，上面写着字，那是从赫尔墨斯的双手间被书写出来。 | When I entered into the cave, I received the tablet zaradi, which was inscribed, from between the hands of Hermes… | 得版的叙事框架，确立文本的「神授」权威性  [(百度百科)](https://baike.baidu.com/item/%E7%BF%A0%E7%8E%89%E5%BD%95/4579712)  |
| 1 | 真实不虚，永不说谎，必然带来真实。 | Tis true without lying, certain & most true. | 开篇立誓：以下内容为最高真理  [(百度百科)](https://baike.baidu.com/item/%E7%BF%A0%E7%8E%89%E5%BD%95/4579712)  |
| 2 | 下如同上，上如同下；依此成全太一的奇迹。 | That which is below is like that which is above and that which is above is like that which is below to do ye miracles of one only thing. | **全篇核心**：大宇宙与小宇宙的映射关系  [(百度百科)](https://baike.baidu.com/item/%E7%BF%A0%E7%8E%89%E5%BD%95/4579712)  |
| 3 | 万物本是太一，藉由分化从太一创造出来。 | And as all things have been and arose from one by ye mediation of one: so all things have their birth from this one thing by adaptation. | 太一生万物：新柏拉图主义式的「流溢」创生  [(百度百科)](https://baike.baidu.com/item/%E7%BF%A0%E7%8E%89%E5%BD%95/4579712)  |
| 4 | 太阳为父，月亮为母，从风孕育，从地养护。 | The Sun is its father, the moon its mother, the wind hath carried it in its belly, the earth its nurse. | 四重孕育：精神（日）、心性（月）、生命力（风）、躯体（地）  [(百度百科)](https://baike.baidu.com/item/%E7%BF%A0%E7%8E%89%E5%BD%95/4579712)  |
| 5 | 世间一切完美之源就在此处；其能力在地上最为完全。 | The father of all perfection in ye whole world is here. Its force or power is entire if it be converted into earth. | 完美之源须落实于「地」——精神与物质的统一  [(百度百科)](https://baike.baidu.com/item/%E7%BF%A0%E7%8E%89%E5%BD%95/4579712)  |
| 6 | 分土于火，萃精于糙，谨慎行之。 | Separate thou ye earth from ye fire, ye subtle from the gross, sweetly with great industry. | **方法总纲**：分离精微与粗浊，温和而勤勉  [(百度百科)](https://baike.baidu.com/item/%E7%BF%A0%E7%8E%89%E5%BD%95/4579712)  |
| 7 | 从地升天，又从天而降，获得其上、其下之能力。 | It ascends from ye earth to ye heaven & again it descends to ye earth and receives ye force of things superior & inferior. | **循环升华**：上下往复，贯通两极之力  [(百度百科)](https://baike.baidu.com/item/%E7%BF%A0%E7%8E%89%E5%BD%95/4579712)  |
| 8 | 如此可得世界的荣耀、远离黑暗蒙昧。 | By this means you shall have ye glory of ye whole world & thereby all obscurity shall fly from you. | 成就：超越对立、获得通觉智慧  [(百度百科)](https://baike.baidu.com/item/%E7%BF%A0%E7%8E%89%E5%BD%95/4579712)  |
| 9 | 此为万力之力，摧坚拔韧。 | Its force is above all force, for it vanquishes every subtle thing & penetrates every solid thing. | 所成之物无坚不摧、无微不入  [(百度百科)](https://baike.baidu.com/item/%E7%BF%A0%E7%8E%89%E5%BD%95/4579712)  |
| 10 | 世界即如此创造，依此可达奇迹。 | So was ye world created. From this are & do come admirable adaptations whereof ye process is here in this. | 炼金过程即宇宙创生的重演  [(百度百科)](https://baike.baidu.com/item/%E7%BF%A0%E7%8E%89%E5%BD%95/4579712)  |
| 11 | 我被称为三重伟大的赫尔墨斯，因我拥有世界三部分的智慧。 | Hence I am called Hermes Trismegist, having the three parts of ye philosophy of ye whole world. | 「三重」或指理念、灵魂、物质三个层面  [(百度百科)](https://baike.baidu.com/item/%E7%BF%A0%E7%8E%89%E5%BD%95/4579712)  |
| 12 | 这就是我所说的伟大工作。 | That which I have said of ye operation of ye Sun is accomplished & ended. | 收束：全篇即「太阳的工作」——伟大工作  [(百度百科)](https://baike.baidu.com/item/%E7%BF%A0%E7%8E%89%E5%BD%95/4579712)  |

值得注意的是，中世纪的抄本传统里还附有一段「顺序重排」的读法提示，把第 7 条（从地升天）与第 2、3 条（上下对应、太一生万物）连读，再把第 8、4、6、5、9、10 条依次串成一个「操作序列」：先确立宇宙论前提，再经分离、落实、循环，最终抵达万力之力  [(百度百科)](https://baike.baidu.com/item/%E7%BF%A0%E7%8E%89%E5%BD%95/4579712) 。这说明历代读者并不把它当作格言集，而是当作一段**可以直接指导操作的工艺说明书**来读。

### 1.3 核心理念：上下对应、太一与万物

「下如同上，上如同下」是整部《翠玉录》的枢纽。
它主张理念、宇宙、自然这个大宇宙，与个人、心灵、灵魂这个小宇宙之间是一种一体、和谐、映射的关系——这一命题后来以拉丁文 *Quod est superius est sicut quod inferius* 的形式成为整个赫尔墨斯主义最著名的口号，也是炼金术宇宙观的基石  [(机核 GCORES)](https://www.gcores.com/articles/197035) 。在这一宇宙观下，炼金的转变过程就有了双重含义：利用物质的转化把性灵从物质中解放出来，既重造物质、又重塑心灵，从而重现太一（「一切万有」）创造世界的奇迹  [(百度百科)](https://baike.baidu.com/item/%E7%BF%A0%E7%8E%89%E5%BD%95/4579712) 。

与上下对应互为表里的是「万物本是太一，藉由分化从太一创造出来」。太一创造的方式是新柏拉图主义的「流溢」说：从一个一体而充盈的最高实在，像太阳放射光芒一样层层分化出理性、灵魂和物质世界，而无损于太一的圆满  [(百度百科)](https://baike.baidu.com/item/%E7%BF%A0%E7%8E%89%E5%BD%95/4579712) 。这两句合起来构成了炼金术的物质观：既然万物同出一源，那么贱金属与贵金属、粗浊与精微之间的差别就不是本体的差别，而是「分化程度」的差别——**嬗变因此在原理上成立**。这正是后世一切「点铅成金」实践的形而上学许可证，也是《翠玉录》被认为暗藏原初物质（prima materia）及其转化之秘的原因  [(Amazon Singapore)](https://www.amazon.sg/Emerald-Tablet-Hermes-Smaragdine-Smaragdina/dp/1977921825) 。

### 1.4 指导思想：分离、循环与「太阳的工作」

在操作层面，《翠玉录》给出的指导思想可以归纳为三步。**其一是分离**：「分土于火，萃精于糙，谨慎行之」——把精微从粗浊中离析出来，且须「温和」（sweetly）而「勤勉」（with great industry），这后来凝结为炼金术最著名的操作格言「溶解与凝聚」（solve et coagula）的方法论底色  [(百度百科)](https://baike.baidu.com/item/%E7%BF%A0%E7%8E%89%E5%BD%95/4579712) 。**其二是循环**：「从地升天，又从天而降，获得其上、其下之能力」——物质须经历上升与下降的往复（对应蒸馏—回流的工艺意象），在循环中同时汲取「上」与「下」两种力量，唯有如此才能「得世界的荣耀、远离黑暗蒙昧」  [(百度百科)](https://baike.baidu.com/item/%E7%BF%A0%E7%8E%89%E5%BD%95/4579712) 。**其三是落实**：「其能力在地上最为完全」——完美之源必须最终凝结回大地，精神性的提升必须落实为物质性的成就，反之亦然  [(百度百科)](https://baike.baidu.com/item/%E7%BF%A0%E7%8E%89%E5%BD%95/4579712) 。

全篇以「这就是我所说的伟大工作」（the operation of ye Sun，直译「太阳的运作」）收束  [(百度百科)](https://baike.baidu.com/item/%E7%BF%A0%E7%8E%89%E5%BD%95/4579712) 。中世纪以降的炼金哲学把这个「伟大工作」（Magnum Opus）展开为经典的四阶段流程：**黑化（Nigredo）、白化（Albedo）、黄化（Citrinitas）、红化（Rubedo）**  [(机核 GCORES)](https://www.gcores.com/articles/197035) 。其中红化是最终阶段，象征物质在熔炉中达到炽热、灵魂与身体合一、上与下等对立面的最终统一，即点金石功效显现、「伟大工程」完成的时刻  [(百度百科)](https://baike.baidu.com/item/%E7%BA%A2%E5%8C%96/62443808) 。需要强调的是，赫尔墨斯式炼金术表面上是把铅变为黄金的一系列操作，实质上是一条把混沌灵魂转化为与永恒和神性合一的神秘哲学道路——外在的金属转化不过是内在灵魂转化的投影，真正的「大作」是炼化人自身  [(机核 GCORES)](https://www.gcores.com/articles/197035) 。

### 1.5 后世诠释：牛顿、荣格与秘传传统

《翠玉录》的生命力在于它允许完全不同的读法。一般的炼金术士把它解读为制取哲人之石（Philosopher's Stone）的指南——凭此石可以制造纯金；或者灵丹妙药（Elixir），可以长生不老  [(百度百科)](https://baike.baidu.com/item/%E7%BF%A0%E7%8E%89%E5%BD%95/4579712) 。而另一脉读者则坚持它本来是哲人寻求智慧开悟、提升精神层次的思想与方法：炼金术把自己包装成实用技术，或许只是为了让这套思想能够流传下去，让真正的哲人看透表面的假象，把关于「物」的描述应用于「心」  [(百度百科)](https://baike.baidu.com/item/%E7%BF%A0%E7%8E%89%E5%BD%95/4579712) 。

两条读法都有重量级的继承者。艾萨克·牛顿以科学家兼炼金家的双重身份亲手翻译了《翠玉录》，把它当作同时包含科学真理与灵性真理的文本  [(Azonomy)](https://azonomy.co.uk/emerald-tablet-myth/?srsltid=AfmBOooNytsRVEhz2vXgob1533-oNEzH7vviZ23fBVGpi7oWcS5JN5G5) ；十九世纪末，布拉瓦茨基夫人把它纳入神智学体系，推广为秘教灵性经典；二十世纪，荣格则系统地把炼金术意象解读为「个体化」心理过程的象征，使《翠玉录》在科学时代以心理学文本的身份延续生命  [(Britannica)](https://www.britannica.com/topic/Emerald-Tablet) 。伊斯兰传统一侧，贾比尔·伊本·哈扬（在欧洲被称为 Geber）的著作群对它有过详尽的发挥，构成阿拉伯炼金术与欧洲炼金术之间的关键桥梁  [(Azonomy)](https://azonomy.co.uk/emerald-tablet-myth/?srsltid=AfmBOooNytsRVEhz2vXgob1533-oNEzH7vviZ23fBVGpi7oWcS5JN5G5) 。

---

## 二、《Noita》：涌现式炼金沙盒

### 2.1 世界观中的炼金：炼金术士团与翠玉板

《Noita》的炼金不是装饰性题材，而是嵌在世界观底层的设定。在游戏世界的大山地下，曾经存在一个**炼金术士团**：他们建有神殿与实验室，留下大量以书籍和**翠玉板（Emerald Tablets）**形式写成的笔记，记述着这个教团的哲学、行事准则与个别成员的研究发现；他们掌握了诸如「伟大之作」（the Work）之类的奥秘知识，但未能将其完成  [(fandom.com)](https://villains.fandom.com/wiki/Alchemists_(Noita)) 。到游戏发生的时代，这些炼金术士或死、或变异、或化为不死之物——设定暗示部分变异源于某些炼金术士达成了某种「飞升」状态，以怪物化为代价换取力量  [(fandom.com)](https://villains.fandom.com/wiki/Alchemists_(Noita)) 。

玩家在世界中能直接遭遇这个遗产：黑暗洞穴西侧**古代实验室**里游荡着受启炼金术士、被诅咒的炼金术士、亡灵炼金术士等敌人；而**废弃的炼金实验室**则由 Boss **高阶炼金术师（Ylialkemisti）**镇守——它有 1000 点生命值、反射投射物的力场与四种召唤法杖攻击，击杀后掉落极其珍贵的希腊字母系列复制法术与水晶钥匙  [(wiki.gg)](https://noita.wiki.gg/wiki/Ylialkemisti) 。更直白的是，游戏终局的两个隐藏生物群系干脆就叫**「伟大之作（地狱）」与「伟大之作（天空）」**  [(wiki.gg)](https://noita.wiki.gg/zh/wiki/%E6%8C%89%E7%94%9F%E7%89%A9%E7%BE%A4%E7%B3%BB%E5%88%92%E5%88%86%E6%95%8C%E4%BA%BA?variant=zh-hans) ——Noita 的整个世界就是一部未完成的 Magnum Opus。

### 2.2 炼金反应总则

Noita 的炼金系统建立在其逐像素材料模拟之上：世界中每一种材料（液体、粉末、气体、固体）都可能与其他材料发生反应。炼金反应的通用结构是「**主要成分（原料）＋次要成分（催化剂）→产物**」，每个反应还有一个**反应速率**数值（越高越快） [(fandom.com)](https://noita.fandom.com/zh/wiki/%E7%82%BC%E9%87%91?variant=zh-cn) 。其中有两条总规则需要首先掌握：

- **随机三元配方**：活性混合物质（Lively Concoction）与炼金溶液（Alchemic Precursor）这两种最重要的液体，其配方在每个世界种子中随机生成，均由**三种随机选取的材料**（液体或粉末）合成；约半数配方只需要液体，另一半会需要一种粉末  [(fandom.com)](https://noita.fandom.com/wiki/Alchemy) 。
- **种子确定性**：随机配方看似不可捉摸，实则完全由世界种子决定，因此存在种子计算器（社区制作的网页工具与游戏内 Mod）可以直接查询  [(wiki.gg)](https://noita.wiki.gg/wiki/Alchemy) 。

随机配方的候选池是固定的两张表。**液体候选**：水、冷水、沼泽、泥、油、威士忌、血液、真菌血液、蠕虫血液、毒性淤泥、水泥、酸液、岩浆、尿液、毒药、传送基质、变形魔药、混乱变形魔药、狂暴基质、费洛蒙、隐形魔药；**粉末候选**：沙、骨、土、蜂蜜、粘液、雪、腐肉、蜡、金、银、铜、黄铜、钻石、煤、火药、爆炸火药、草、真菌  [(fandom.com)](https://noita.fandom.com/wiki/Random_Materials) 。

### 2.3 已知炼金配方全集

除两个随机配方外，游戏中存在一张庞大的**固定配方表**。下表按功能分类整理全部已知炼金反应（带 `*` 的催化剂表示它在反应中同时充当转化对象） [(fandom.com)](https://noita.fandom.com/zh/wiki/%E7%82%BC%E9%87%91?variant=zh-cn) ：

**A. 终极圣物（点金与万能药体系）**

| 主要成分 | 催化剂 | 产物 | 备注 |
|---|---|---|---|
| ？（3 种随机材料） | — | **活性混合物质** | 随种子变化；治疗效率优于生命基质，会快速蒸发  [(wiki.gg)](https://noita.wiki.gg/wiki/Alchemy)  |
| ？（3 种随机材料） | — | **炼金溶液** | 随种子变化；易燃，饮用导致食物中毒与中毒  [(wiki.gg)](https://noita.wiki.gg/wiki/Alchemic_Precursor)  |
| 炼金溶液 | 任意肉类 | **点金之水** | 只需极少量肉——点金之水会把炼金溶液也转化为点金之水  [(wiki.gg)](https://noita.wiki.gg/wiki/Alchemy)  |
| 炼金溶液 | 点金之水* | 点金之水 | 自我增殖  [(wiki.gg)](https://noita.wiki.gg/wiki/Alchemy)  |
| 岩浆 | 炼金溶液 | 岩浆＋**点金之气** | 金色气体上升，接触之物尽化为金  [(wiki.gg)](https://noita.wiki.gg/wiki/Alchemy)  |
| 生命基质／活性混合物质 | 净化粉末 | 火药（点燃） | 反应速率 80，危险  [(fandom.com)](https://noita.fandom.com/zh/wiki/%E7%82%BC%E9%87%91?variant=zh-cn)  |

**B. 金属嬗变链（贵重→普通逐级退化，均副产烟）**

| 主要成分 | 催化剂 | 产物 | 备注 |
|---|---|---|---|
| 钻石／黄金（粉末） | 混乱变形魔药 | 银＋烟 | 速率 50  [(fandom.com)](https://noita.fandom.com/zh/wiki/%E7%82%BC%E9%87%91?variant=zh-cn)  |
| 银 | 变形魔药 | 铜＋烟 | 速率 50  [(fandom.com)](https://noita.fandom.com/zh/wiki/%E7%82%BC%E9%87%91?variant=zh-cn)  |
| 铜 | 传送基质 | 黄铜＋烟 | 速率 50  [(fandom.com)](https://noita.fandom.com/zh/wiki/%E7%82%BC%E9%87%91?variant=zh-cn)  |
| 黄铜 | 不稳传送基质 | 金属粉末＋烟 | 速率 50  [(fandom.com)](https://noita.fandom.com/zh/wiki/%E7%82%BC%E9%87%91?variant=zh-cn)  |
| 铜＋黄铜 | 水 | 银＋烟 | 逆向回升，速率 100  [(fandom.com)](https://noita.fandom.com/zh/wiki/%E7%82%BC%E9%87%91?variant=zh-cn)  |
| 银＋铜 | 血液 | 钻石＋烟 | 逆向合成钻石，速率 100  [(fandom.com)](https://noita.fandom.com/zh/wiki/%E7%82%BC%E9%87%91?variant=zh-cn)  |

**C. 魔药互转与复制增殖**

| 主要成分 | 催化剂 | 产物 | 备注 |
|---|---|---|---|
| 变形魔药 | 毒性淤泥* | 混乱变形魔药 | 双向皆可，速率 15  [(fandom.com)](https://noita.fandom.com/zh/wiki/%E7%82%BC%E9%87%91?variant=zh-cn)  |
| 混乱魔药 | 油＋血液 | 不稳变形魔药 | 血液为主要反应物，可大量生成  [(fandom.com)](https://noita.fandom.com/zh/wiki/%E7%82%BC%E9%87%91?variant=zh-cn)  |
| 传送基质 | 威士忌* | 不稳传送基质 | 速率 5  [(fandom.com)](https://noita.fandom.com/zh/wiki/%E7%82%BC%E9%87%91?variant=zh-cn)  |
| 传送基质 | 不稳传送基质* | 不稳传送基质 | 自我增殖  [(fandom.com)](https://noita.fandom.com/wiki/Alchemy)  |
| 不稳传送基质 | 粘液 | 传送基质 | 需极小量不稳传送基质，否则会被逆转  [(fandom.com)](https://noita.fandom.com/wiki/Alchemy)  |
| 加速基质 | 漂浮基质 | 迅捷基质 | 同时获得两种效果，但饮用持续时间减半  [(fandom.com)](https://noita.fandom.com/zh/wiki/%E7%82%BC%E9%87%91?variant=zh-cn)  |
| 金属粉末（金/铜/黄铜/银）或钻石 | 混乱魔药 | 漂浮基质 | 速率 45  [(fandom.com)](https://noita.fandom.com/zh/wiki/%E7%82%BC%E9%87%91?variant=zh-cn)  |
| 蠕虫信息素 | 蠕虫血液 | 混乱魔药 | 速率 15  [(fandom.com)](https://noita.fandom.com/zh/wiki/%E7%82%BC%E9%87%91?variant=zh-cn)  |
| 混乱魔药 | 狂暴基质 | 费洛蒙 | 生成量等于反应物体积之和  [(fandom.com)](https://noita.fandom.com/zh/wiki/%E7%82%BC%E9%87%91?variant=zh-cn)  |
| 威士忌 | 青蛙肉*（蛙类尸体） | 狂暴基质 | 速率 10  [(fandom.com)](https://noita.fandom.com/zh/wiki/%E7%82%BC%E9%87%91?variant=zh-cn)  |
| 水 | 汇聚法力* | 汇聚法力 | 自我复制；可借「毒性淤泥→水」间接把毒泥变成汇聚法力  [(fandom.com)](https://noita.fandom.com/zh/wiki/%E7%82%BC%E9%87%91?variant=zh-cn)  |
| 隐形魔药 | 水* | 水 | 使水对隐形玩家更危险  [(fandom.com)](https://noita.fandom.com/zh/wiki/%E7%82%BC%E9%87%91?variant=zh-cn)  |

**D. 功能材料合成**

| 主要成分 | 催化剂 | 产物 | 备注 |
|---|---|---|---|
| 蜂蜜 | 钻石 | 神佑魔药＋毒液 | 神佑魔药可免疫一切伤害；毒液会逐渐挥发  [(fandom.com)](https://noita.fandom.com/zh/wiki/%E7%82%BC%E9%87%91?variant=zh-cn)  |
| 黄铜 | 钻石 | 净化粉末 | 生成量等于反应物体积之和  [(fandom.com)](https://noita.fandom.com/zh/wiki/%E7%82%BC%E9%87%91?variant=zh-cn)  |
| 钻石＋银 | 蠕虫血液 | 净化粉末＋烟 | 速率 100  [(fandom.com)](https://noita.fandom.com/zh/wiki/%E7%82%BC%E9%87%91?variant=zh-cn)  |
| 真菌血液 | 毒性淤泥＋沙 | 神秘真菌 | 不参与真菌转换（除非手持），速率 100  [(fandom.com)](https://noita.fandom.com/zh/wiki/%E7%82%BC%E9%87%91?variant=zh-cn)  |
| 神秘真菌 | 毒性淤泥／沙 | 神秘真菌 | 可用来种植并清除大片沙地  [(fandom.com)](https://noita.fandom.com/zh/wiki/%E7%82%BC%E9%87%91?variant=zh-cn)  |
| 不稳传送基质 | 混乱魔药 | 火＋指路粉末 | 反向滴加可大量制取指路粉末  [(fandom.com)](https://noita.fandom.com/zh/wiki/%E7%82%BC%E9%87%91?variant=zh-cn)  |
| 毒性淤泥 | 蠕虫血液＋真菌血液 | 虚空液体 | 繁茂洞穴中蠕虫受伤可自然触发  [(fandom.com)](https://noita.fandom.com/zh/wiki/%E7%82%BC%E9%87%91?variant=zh-cn)  |
| 混乱变形魔药 | 钻石＋毒性淤泥 | 虚空液体 | 速率 100  [(fandom.com)](https://noita.fandom.com/zh/wiki/%E7%82%BC%E9%87%91?variant=zh-cn)  |
| 任何真菌类物质／毒性淤泥 | 虚空液体* | 虚空液体 | 极少量即可抹除大片繁茂洞穴  [(fandom.com)](https://noita.fandom.com/zh/wiki/%E7%82%BC%E9%87%91?variant=zh-cn)  |
| 骨 | 呕吐物 | 缩减基质 | —  [(fandom.com)](https://noita.fandom.com/wiki/Alchemy)  |
| 尿液 | 岩浆 | 愚人金 | —  [(fandom.com)](https://noita.fandom.com/wiki/Alchemy)  |
| 盐水 | 火 | 盐 | —  [(fandom.com)](https://noita.fandom.com/wiki/Alchemy)  |
| 黄铜 | 液态火 | 震荡粉末 | —  [(fandom.com)](https://noita.fandom.com/wiki/Alchemy)  |
| 血液 | 毒药 | 粘液＋烟 | —  [(fandom.com)](https://noita.fandom.com/wiki/Alchemy)  |
| 肉 | 毒药 | 腐肉 | —  [(fandom.com)](https://noita.fandom.com/wiki/Alchemy)  |

**E. 净化、复制与环境改造**

| 主要成分 | 催化剂 | 产物 | 备注 |
|---|---|---|---|
| 「不净物质」 | 净化粉末* | 水 | 涵盖绝大多数非水常见液体（魔药、不详液体、油、酸液等，不含岩浆）  [(fandom.com)](https://noita.fandom.com/zh/wiki/%E7%82%BC%E9%87%91?variant=zh-cn)  |
| 净化粉末 | 岩浆 | 火药（点燃） | 切勿试图用净化粉末把岩浆化成水  [(fandom.com)](https://noita.fandom.com/zh/wiki/%E7%82%BC%E9%87%91?variant=zh-cn)  |
| 毒性淤泥 | 水* | 水 | 可把毒泥池变成水池  [(fandom.com)](https://noita.fandom.com/wiki/Alchemy)  |
| 毒性淤泥 | 泥*／沼泽* | 沼泽 | 可大量制造沼泽  [(fandom.com)](https://noita.fandom.com/wiki/Alchemy)  |
| 沼泽 | 毒性淤泥 | 泥炭 | —  [(fandom.com)](https://noita.fandom.com/wiki/Alchemy)  |
| 冰冷液体 | 蠕虫血液* | 蠕虫血液 | 自我复制  [(fandom.com)](https://noita.fandom.com/zh/wiki/%E7%82%BC%E9%87%91?variant=zh-cn)  |

**F. 破坏性／危险性反应**

| 主要成分 | 催化剂 | 产物 | 备注 |
|---|---|---|---|
| 加速／漂浮／迅捷基质 | 粘液 | 蓝色火焰＋蒸汽（伴随爆炸） | 爆炸伤害**特别**高，速率 50  [(fandom.com)](https://noita.fandom.com/zh/wiki/%E7%82%BC%E9%87%91?variant=zh-cn)  |
| 传送基质／不稳传送基质 | 汇聚法力* | 火焰 | 火焰会烧尽传送魔药并产生冰冷蒸汽  [(fandom.com)](https://noita.fandom.com/zh/wiki/%E7%82%BC%E9%87%91?variant=zh-cn)  |
| 传送基质／不稳传送基质 | 火 | 冰冷蒸汽 | —  [(fandom.com)](https://noita.fandom.com/wiki/Alchemy)  |
| 粘液 | 火焰 | 粘液雾 | 粘液雾不可燃，可用来快速灭火  [(fandom.com)](https://noita.fandom.com/zh/wiki/%E7%82%BC%E9%87%91?variant=zh-cn)  |
| 粘液 | 水* | 粘液雾 | 粘液被水逐渐分解  [(fandom.com)](https://noita.fandom.com/zh/wiki/%E7%82%BC%E9%87%91?variant=zh-cn)  |
| 粘液 | 威士忌* | 烟 | 粘液被威士忌快速分解  [(fandom.com)](https://noita.fandom.com/zh/wiki/%E7%82%BC%E9%87%91?variant=zh-cn)  |
| 岩浆 | 呕吐物 | 酸液 | —  [(fandom.com)](https://noita.fandom.com/wiki/Alchemy)  |
| 神佑魔药 | 缩减基质 | 酸液 | —  [(fandom.com)](https://noita.fandom.com/wiki/Alchemy)  |
| 汇聚法力 | 巫师之石 | 酸液 | —  [(fandom.com)](https://noita.fandom.com/wiki/Alchemy)  |
| 任何金属 | 汇聚法力* | 蒸汽 | 后期钢质结构区可用；注意金粉金块同样适用  [(fandom.com)](https://noita.fandom.com/wiki/Alchemy)  |

此外，炼金溶液自身还有几条专属反应：与肉类反应生成双倍点金之水；与点金之水互相增殖；与岩浆生成点金之气；与缩减基质生成烟和液态火  [(wiki.gg)](https://noita.wiki.gg/wiki/Alchemic_Precursor) 。

### 2.4 两大随机圣物：活性混合物质与炼金溶液

**活性混合物质（Lively Concoction）**是一种绿色的强力治疗药剂，治疗效率优于本就稀有的生命基质（Healthium），但会快速蒸发，因此一发现就应立即装瓶  [(wiki.gg)](https://noita.wiki.gg/wiki/Alchemy) 。**炼金溶液（Alchemic Precursor）**是一种蓝色液体，本身除了高度易燃（类似威士忌）和饮用后造成十秒食物中毒与中毒之外毫无用处，但它是制造**点金之水**不可或缺的反应物：向其中加入任意肉类（尸体碎块即可），即生成点金之水——这种液体把接触到的一切材料转化为黄金；由于点金之水会把炼金溶液继续转化为点金之水，实际上只需要一丁点肉  [(wiki.gg)](https://noita.wiki.gg/wiki/Alchemy) 。炼金溶液接触岩浆则生成**点金之气**——一种上升的金色气体，行为类似点金之水，把触及之物尽数化为黄金  [(wiki.gg)](https://noita.wiki.gg/wiki/Alchemy) 。

Wiki 的考据明确指出：点金之水戏仿的是希腊神话中点物成金的弥达斯王，而点金之水与活性混合物质这对组合，对应的正是赫尔墨斯炼金文本中两大终极之作——**嬗变（transmutation）与万能药（panacea）**  [(wiki.gg)](https://noita.wiki.gg/wiki/Alchemy) 。换言之，Noita 把《翠玉录》传统里「哲人之石点石成金、灵丹妙药治百病」的双重承诺，翻译成了两套随种子隐藏在世界里的真实配方。

寻找这两条配方的常规途径不是推理而是观察：由于候选组合数量庞大，纯靠游戏内手段几乎不可能逆推，大多数玩家是在世界探索中偶然看到特征性的**蓝色或绿色液体**出现才发现配方  [(wiki.gg)](https://noita.wiki.gg/wiki/Alchemy) 。有经验的做法包括：在极致密岩石地面（如沙漠尽头、结构虚空等「天然实验室」）上小剂量试混候选材料；或利用重力——往钻了管道的水泥塔里灌注液体、在粉末床上铺候选粉末，观察产物出现的最高点以排除下方所有材料，此法可同时筛查两种配方  [(wiki.gg)](https://noita.wiki.gg/wiki/Alchemic_Precursor) 。社区也提供了按种子直接查询的计算器网页与游戏内 Mod  [(wiki.gg)](https://noita.wiki.gg/wiki/Alchemy) 。此外，拟态液（Mimicium）会变成接触到的任何液体，可借此复制活性混合物质、点金之水、神佑魔药等稀有液体  [(wiki.gg)](https://noita.wiki.gg/zh/wiki/%E6%8B%9F%E6%80%81%E4%B9%8B%E6%B5%B7?variant=zh-cn) 。

### 2.5 金属嬗变链与逆向合成

Noita 内置了一条完整的**金属退化链**，恰好构成对传统炼金「贵金属阶梯」的倒置戏仿：钻石经混乱变形魔药变为银，银经变形魔药变为铜，铜经传送基质变为黄铜，黄铜经不稳传送基质退化为金属粉末——每步副产烟  [(fandom.com)](https://noita.fandom.com/zh/wiki/%E7%82%BC%E9%87%91?variant=zh-cn) 。与之相对存在逆向操作：铜加黄铜遇水回升为银，银加铜遇血液则合成**钻石**  [(fandom.com)](https://noita.fandom.com/zh/wiki/%E7%82%BC%E9%87%91?variant=zh-cn) 。

钻石本身用途有限，但它是多条高价值反应的枢纽：钻石加蜂蜜生成神佑魔药（无敌涂层，副产毒液）；钻石加黄铜制净化粉末；钻石加银加蠕虫血液也能制净化粉末  [(fandom.com)](https://noita.fandom.com/zh/wiki/%E7%82%BC%E9%87%91?variant=zh-cn) 。由于试剂多为粉末，Wiki 建议常备粉末袋（Powder Pouch）来收集与组装反应物  [(wiki.gg)](https://noita.wiki.gg/wiki/Alchemy) 。

### 2.6 世俗反应：基于物理常识的材料相互作用

在「魔法炼金」之外，Noita 还有一整套部分基于现实原理的**世俗反应**  [(wiki.gg)](https://noita.wiki.gg/wiki/Alchemy) ：

| 反应 | 说明 |
|---|---|
| 水＋火 → 蒸汽 | 基础汽化 |
| 水＋冰冷液体 → 冰 | 冻结 |
| 水＋岩浆 → 岩石 | 冷却凝固 |
| 冰冷液体＋岩浆 → 致密岩石 | 更坚硬的凝固物 |
| 毒性淤泥＋岩浆 → 毒性岩石 | 接触即受伤 |
| 毒药＋岩浆 → 有毒岩石 | 类似毒性岩石 |
| 血液＋岩浆 → 火山岩 | — |
| 泥＋岩浆 → 地面 | — |
| 盐水＋岩浆 → 发光物质 | — |
| 火＋黄铜 → 震荡粉末 | — |
| 水泥／泥炭＋岩浆 → 烟 | 固液两态水泥均可反应  [(fandom.com)](https://noita.fandom.com/wiki/Alchemy)  |

这些反应不构成配方意义上的「炼金」，但它们共享同一套材料反应引擎——在 Noita 里，**炼金术与物理学的边界被刻意抹平**：灭火（粘液＋火→不可燃粘液雾）、净水（毒泥＋水）、造桥（水＋岩浆造岩）都是广义的嬗变操作  [(fandom.com)](https://noita.fandom.com/zh/wiki/%E7%82%BC%E9%87%91?variant=zh-cn) 。

### 2.7 真菌转换：世界层面的永久嬗变

如果说配方反应是「坩埚中的炼金」，那么**真菌转换（Fungal Reality Shift）**就是「世界尺度的炼金」——它直接改写现实规则本身。其机制如下  [(wiki.gg)](https://noita.wiki.gg/zh/wiki/%E7%9C%9F%E8%8F%8C%E8%BD%AC%E6%8D%A2?variant=zh-cn) ：

- **触发**：当致幻（Tripping）状态累计达到至少 **180 秒**并开始或继续叠加时触发；触发时伴随音效与「你听见『材料』这个词在回响……」等六条游戏信息之一。拥有吸血术天赋则不再触发  [(wiki.gg)](https://noita.wiki.gg/zh/wiki/%E7%9C%9F%E8%8F%8C%E8%BD%AC%E6%8D%A2?variant=zh-cn) 。
- **效果**：随机选定一对「原始材料→目标材料」，将**该物质在世界中的全部存量永久转化**为新物质，并在玩家附近生成少量产物作为提示；致幻效果随即清除，此后 5 分钟内不能再触发  [(wiki.gg)](https://noita.wiki.gg/zh/wiki/%E7%9C%9F%E8%8F%8C%E8%BD%AC%E6%8D%A2?variant=zh-cn) 。
- **上限与继承**：一局游戏中最多发生 **20 次**真菌转换，且转换结果会**延续到新游戏+（NG+）**的新世界  [(wiki.gg)](https://noita.wiki.gg/zh/wiki/%E7%9C%9F%E8%8F%8C%E8%BD%AC%E6%8D%A2?variant=zh-cn) 。
- **定向操控**：触发时若手持装有材料的烧瓶，有 **75%** 概率让转换对的一端锁定为烧瓶内的主要材料——这为「消除危险物质」（如把变形魔药从世界中抹除）提供了可行手段，但每次尝试仍有 37.5% 概率失败（把别的物质变成瓶中物）与 25% 概率完全随机  [(fandom.com)](https://noita.fandom.com/wiki/Fungal_Reality_Shift) 。
- **链式效应与断链**：转换按原始身份作用于材料；若发生 A→B 之后又发生 B→C，则 A 保留 B 的名称外观但反应身份转为 C，可能出现「断链」——例如水经「水→信息素→毒液→变形魔药」的链条后，会呈现毒液的外观、保留毒液的接触伤害，却在沾染或饮用时施加变形效果  [(fandom.com)](https://noita.fandom.com/wiki/Fungal_Reality_Shift) 。

可被转换的原始材料按概率分组：最常见的一组（水/盐水/冷水、岩浆、毒性淤泥/毒药/不详液体、油/沼泽/泥炭、血液、真菌血液/怪异真菌/真菌土壤、冰冷液体/蠕虫血液、酸液）各占约 9.32%，钻石、银/黄铜/铜各占约 5.59%，各类气体与变形魔药类约 3.73%，蒸汽/烟约 1.86%，岩石约 0.47%，沙与压实的雪约 0.38%，而**黄金（含金块）仅有约 0.0028%** 的极低概率  [(fandom.com)](https://noita.fandom.com/wiki/Fungal_Reality_Shift) 。目标材料池则更宽：除常见液体外还包括西玛酒、豌豆汤、奶酪、排泄物、虚空液体（各约 0.05%）等稀有结果  [(fandom.com)](https://noita.fandom.com/wiki/Fungal_Reality_Shift) 。真菌转换不可逆，只能通过后续转换覆盖，风险极高（例如把可燃气体转换成酸液可能直接摧毁游戏运行），须谨慎对待  [(wiki.gg)](https://noita.wiki.gg/zh/wiki/%E7%9C%9F%E8%8F%8C%E8%BD%AC%E6%8D%A2?variant=zh-cn) 。

### 2.8 炼金实践：实验方法与工具

综合社区经验，Noita 中的「炼金术士工作流」大致是：**观察**（留意蓝、绿色液体的特征色与地图上的异常材料）→**采样**（烧瓶与粉末袋分别采集液体与粉末）→**试混**（在致密岩石等平整地面小剂量混合，或利用水泥塔重力筛查法大规模排除候选）→**增殖**（利用自我复制反应，如汇聚法力＋水、点金之水＋炼金溶液、拟态液复制）放大成果  [(wiki.gg)](https://noita.wiki.gg/wiki/Alchemic_Precursor) 。值得注意的是，许多反应的实用价值在于**体积守恒或增殖**（如费洛蒙、净化粉末的生成量等于反应物体积之和；毒泥可被水大规模转化），这与真实炼金术「以少量哲人之石投射（projection）转化大量贱金属」的思想在结构上同构  [(fandom.com)](https://noita.fandom.com/zh/wiki/%E7%82%BC%E9%87%91?variant=zh-cn) 。

![Noita 炼金体系总览](图2_Noita炼金体系.png)

---

## 三、《药剂工艺：炼金模拟器》：系统化经营炼金

### 3.1 游戏定位与炼金理念

《药剂工艺：炼金模拟器》（Potion Craft: Alchemist Simulator，niceplay games 开发、tinyBuild 发行，2022 年 12 月正式发售）是一款炼金术士模拟器：玩家与工具和原料进行物理交互来调制药剂，并完全掌控自己的商店——发明新配方、吸引顾客、尽情实验，「整个镇子都指望着你」  [(indienova 独立游戏)](https://indienova.com/game/potion-craft) 。与 Noita 把炼金藏进世界物理不同，《药剂工艺》把炼金术**抽象为一套完整的工艺流程**：研磨原料、在锅中混合、加热、煮沸、搅拌、加入基底——官方介绍语几乎就是一段炼金操作口诀：「制定你的药剂计划。研磨原料并在锅中仔细混合。加热煤。煮沸并搅拌。添加基质：水、油或……其他东西。祝贺你的第一剂药剂！」  [(indienova 独立游戏)](https://indienova.com/game/potion-craft) 

它的指导思想藏在「**通过炼金地图仔细规划路线，以结合不同的效果**」这句话里：炼金不再是背配方，而是在一张抽象空间中**导航**——每种原料都是一段向量路径，每种效果都是一个目的地，炼金术士的全部技艺就是规划一条从原点出发、精确抵达目的地（甚至连续抵达多个目的地）的航线  [(fandom.com)](https://potion-craft.fandom.com/wiki/Potions) 。

### 3.2 炼金地图：作为抽象空间的伟大工作

**炼金地图（Alchemy Map）**是炼金术的核心装置，它是对制药过程所穿越的抽象空间的可视化呈现：坩埚中药剂的状态由「药剂标记」（一个装着液体的瓶子图标）表示；向锅中加入原料会绘制出该原料的路径并接在现有路径末端；**搅拌**坩埚使药瓶沿已绘路径（不可逆地）前进；**使用长柄勺**则让药瓶沿直线向地图原点回退  [(fandom.com)](https://potion-craft.fandom.com/wiki/Alchemy_Map) 。地图上分布着若干地形要素  [(fandom.com)](https://potion-craft.fandom.com/wiki/Alchemy_Map) ：

| 要素 | 所属地图 | 机制 |
|---|---|---|
| 漩涡（Whirlpool） | 水、油地图 | 拉风箱加热时按线条方向旋转（均为顺时针）；药瓶接触时被卷向中心，可借其「免费」位移；抵达中心会**传送**到地图另一固定位置（落点一经探索即永久标注），可能是有利捷径也可能是陷阱，落点常补偿一本经验书  [(fandom.com)](https://potion-craft.fandom.com/wiki/Alchemy_Map)  |
| 骨头区（Bones） | 全部地图 | 药瓶在其中移动会持续损失药剂生命值，生命耗尽则药剂报废 |
| 沼泽区（Swamp） | 油地图专属 | 药瓶移动速度减半，可用来抵消多余路径、精细控制走位  [(fandom.com)](https://potion-craft.fandom.com/wiki/Alchemy_Map)  |
| 碎骨区（Broken Bones） | 酒地图专属 | 伤害只有普通骨头的四分之一，可在其中长途穿越甚至连续传送  [(fandom.com)](https://potion-craft.fandom.com/wiki/Alchemy_Map)  |
| 治疗区（Healing Zone） | 酒地图专属 | 绿色十字簇，接触时以十倍速率恢复药剂生命，是酒地图远航的生命线  [(fandom.com)](https://potion-craft.fandom.com/wiki/Alchemy_Map)  |
| 经验书 | 全部地图 | 拾取获得天赋经验，分小（1）、中（2）、大（3）、特大（4、5）多档  [(fandom.com)](https://potion-craft.fandom.com/wiki/The_Alchemist%27s_Path)  |

水基底地图是所有地图中最大的，包含全部 41 种效果，玩家通常将其分为内环与外环——外环由大片骨头墙隔开，效果带有不同程度的**倾斜角度**，属于后期章节（配合油、酒基底）的高级内容  [(fandom.com)](https://potion-craft.fandom.com/wiki/Alchemy_Map) 。

### 3.3 三种基底：水、油、酒

基底（Base）即药剂的溶剂，切换基底即切换整张炼金地图。三种基底构成难度与收益的递进  [(fandom.com)](https://potion-craft.fandom.com/wiki/Alchemy_Map) ：

| 基底 | 购入价 | 地图特征 | 定位 |
|---|---|---|---|
| **水** | 初始 | 最大地图，含全部 41 种效果；离开骨头区后药剂自动缓慢回血；有漩涡 | 覆盖至第五章的主地图；后期炼金机配方仍需回到水图  [(fandom.com)](https://potion-craft.fandom.com/wiki/Alchemy_Map)  |
| **油** | 8,000 金 | 效果多为倾斜（仅 12 种效果保持直立，主要是各系「防护」）；骨头呈小簇分布；有沼泽区与漩涡；缺 20 种效果 | 第六章解锁，通往防护系效果  [(fandom.com)](https://potion-craft.fandom.com/wiki/Alchemy_Map)  |
| **酒** | 15,000 金 | 最小地图，效果彼此更近（便于多效复合）；仅 6 种效果直立；遍布骨头与碎骨，靠治疗区续航；**无漩涡** | 第七章后高级地图，适合多效药剂  [(fandom.com)](https://potion-craft.fandom.com/wiki/Alchemy_Map)  |

三张地图各缺 20 种效果，意味着**没有任何单一基底能独揽全部配方**——基底选择本身就是配方设计的一部分  [(fandom.com)](https://potion-craft.fandom.com/wiki/Alchemy_Map) 。

### 3.4 原料体系：草药、蘑菇、矿石与盐

原料分为几大类，每种原料在罗盘上都有对应方向与颜色，决定其在地图上绘出的路径形状  [(fandom.com)](https://potion-craft.fandom.com/wiki/Ingredients) ：

- **草药（Herbs）**：约 29 种，从第一章的火铃铛、风之花、水之花、泰拉瑞亚、生命叶、缠枝草，到后期的法术花、法师果、恐怖花蕾等，按章节逐步解锁，单价从十几金到一百五十金不等  [(fandom.com)](https://potion-craft.fandom.com/wiki/Ingredients) 。
- **蘑菇（Mushrooms）**：约 20 种，如树仙鞍菇、疯癫蘑菇、沼泽菇、臭菇、硫磺架、巫术蘑菇、影子鸡油菇，直到墓穴松露、彩虹帽  [(fandom.com)](https://potion-craft.fandom.com/wiki/Ingredients) 。
- **矿石（Minerals）**：9 种晶体（云晶、土黄铁矿、霜蓝宝石、火黄晶、血红宝石、奥术水晶、生命水晶、瘟疫辉锑矿、传说铋矿）。矿石不画路径，而是让药瓶**从 A 点直接传送到 B 点**，可借此飞越骨头墙；价格昂贵（二百到一千四百金），但洞窟种植更新后每日最多可自产 600 颗  [(fandom.com)](https://potion-craft.fandom.com/wiki/Ingredients) 。
- **盐（Salts）**：五种魔法盐，只能通过炼金机自行合成，以颗粒形式倒入坩埚，**不计入药剂的原料种类数**，这使它在满足「限原料数」的顾客需求时至关重要  [(fandom.com)](https://potion-craft.fandom.com/wiki/Ingredients) 。
- **种子（Seeds）**：种植于魔法花园，浇水后次日收获对应原料  [(fandom.com)](https://potion-craft.fandom.com/wiki/Ingredients) 。

一个具有教学意义的结论：游戏中**全部 41 种效果都可以只用四种基础原料**（火铃铛、水之花、泰拉瑞亚、风之花）或四种序位原料（疯癫蘑菇、巫术蘑菇、臭菇、生命叶）调出——昂贵的原料只是让路线更短、更省  [(fandom.com)](https://potion-craft.fandom.com/wiki/Potions) 。这与真实炼金术「万物同源、贵贱只在路径」的思想形成有趣的互文。

### 3.5 四十一种药剂效果全集

当前版本（v2.0）共有 **41 种药剂效果**，按「炼金术士之路」章节逐步开放，下表为全集（价格为基础价，实际售价还需除以 10 并受难度与天赋修正） [(fandom.com)](https://potion-craft.fandom.com/wiki/Effects) ：

| 效果 | 首现章节 | 水图 | 油图 | 酒图 | 基础价 |
|---|---|---|---|---|---|
| 治疗 Healing | I | ✓ | ✓ | ✓ | 100 |
| 冰霜 Frost | I | ✓ | ✗ | ✓ | 200 |
| 中毒 Poisoning | I | ✓ | ✓ | ✗ | 130 |
| 火 Fire | I | ✓ | ✓ | ✗ | 245 |
| 爆炸 Explosion | II | ✓ | ✓ | ✗ | 435 |
| 狂野生长 Wild Growth | II | ✓ | ✓ | ✗ | 330 |
| 力量 Strength | II | ✓ | ✗ | ✓ | 290 |
| 手巧 Dexterity | II | ✓ | ✗ | ✓ | 460 |
| 迅捷 Swiftness | II | ✓ | ✗ | ✓ | 480 |
| 闪电 Lightning | III | ✓ | ✓ | ✗ | 615 |
| 法力 Mana | III | ✓ | ✗ | ✓ | 365 |
| 石肤 Stone Skin | III | ✓ | ✓ | ✗ | 495 |
| 睡眠 Sleep | III | ✓ | ✗ | ✓ | 495 |
| 光 Light | III | ✓ | ✓ | ✗ | 545 |
| 魅惑 Charm | IV | ✓ | ✗ | ✓ | 755 |
| 减速 Slowness | IV | ✓ | ✗ | ✓ | 660 |
| 狂怒 Rage | IV | ✓ | ✗ | ✓ | 870 |
| 透视 Magical Vision | IV | ✓ | ✗ | ✓ | 920 |
| 酸 Acid | V | ✓ | ✗ | ✓ | 720 |
| 性欲 Libido | V | ✓ | ✗ | ✓ | 1120 |
| 隐形 Invisibility | V | ✓ | ✓ | ✗ | 1150 |
| 悬浮 Levitation | V | ✓ | ✗ | ✓ | 1320 |
| 通灵 Necromancy | V | ✓ | ✗ | ✓ | 2370 |
| 毒防护 Poison Protection | VI | ✓ | ✓ | ✗ | 515 |
| 闪电防护 Lightning Protection | VI | ✓ | ✓ | ✗ | 830 |
| 火防护 Fire Protection | VI | ✓ | ✓ | ✗ | 790 |
| 霜防护 Frost Protection | VI | ✓ | ✓ | ✗ | 770 |
| 胶着 Gluing | VI | ✓ | ✓ | ✗ | 640 |
| 滑溜 Slipperiness | VI | ✓ | ✓ | ✗ | 685 |
| 恶臭 Stench | VI | ✓ | ✓ | ✗ | 645 |
| 酸防护 Acid Protection | VII | ✓ | ✓ | ✗ | 760 |
| 反魔法 Anti-Magic | VII | ✓ | ✓ | ✗ | 1540 |
| 缩小 Shrinking | VII | ✓ | ✓ | ✗ | 1215 |
| 变大 Enlargement | VII | ✓ | ✓ | ✗ | 1180 |
| 回春 Rejuvenation | VII | ✓ | ✓ | ✗ | 980 |
| 灵感 Inspiration | VIII | ✓ | ✗ | ✓ | 1400 |
| 芳馨 Fragrance | VIII | ✓ | ✗ | ✓ | 700 |
| 恐惧 Fear | VIII | ✓ | ✗ | ✓ | 1100 |
| 幻觉 Hallucinations | IX | ✓ | ✗ | ✓ | 1200 |
| 好运 Luck | IX | ✓ | ✗ | ✓ | 1700 |
| 诅咒 Curse | IX | ✓ | ✗ | ✓ | 900 |

效果之间存在**兼容与冲突**：例如治疗与中毒互相抵消会降低药剂价值甚至使其失效；而当顾客需求有多种答案时，一瓶兼容的双效药反而更值钱  [(fandom.com)](https://potion-craft.fandom.com/wiki/Potions) 。

### 3.6 炼药流程：从研磨到装瓶

一剂药剂的完整工艺流程如下  [(fandom.com)](https://potion-craft.fandom.com/wiki/Potions) ：

1. **选料**：从库存取原料。原料在罗盘上的方向与距离构成它的「路径向量」。
2. **研磨**：用研钵与研杵研磨原料，揭示其完整路径——研磨越充分，路径延伸越长；部分研磨（如 60%）是精确控制走位的基本功。矿石需先敲碎再研磨  [(fandom.com)](https://potion-craft.fandom.com/wiki/Ingredients) 。
3. **投料绘径**：把原料投入坩埚，其路径立即绘制在地图现有路径的末端。
4. **搅拌行进**：搅拌坩埚，药瓶沿已绘路径前进。此过程不可逆，因此「画多少、走多少」需要精确计算。
5. **兑基底回调**：用长柄勺加入基底，药瓶沿直线向地图中心回退——这是修正过冲、对齐目标的核心技巧（中文社区称之为「兑水」）  [(fandom.com)](https://potion-craft.fandom.com/wiki/Alchemy_Map) 。
6. **加热赋效**：当药瓶与某个效果标记对齐时，拉风箱加热坩埚，把该效果注入药液。**对齐精度决定等级**：I、II、III 级售价倍率分别为 1、1.75、2.5 倍；倾斜的效果还需要用月之盐/日之盐把药瓶转到匹配角度  [(fandom.com)](https://potion-craft.fandom.com/wiki/Potions) 。
7. **复合与装瓶**：一瓶药最多有 **5 个效果槽位**，超出时最旧的效果被挤出；完成后可保存配方、命名与定制外观，之后即可从配方书一键复现  [(fandom.com)](https://potion-craft.fandom.com/wiki/Potions) 。

进阶操作还包括：借漩涡传送实现超远位移（酒图除外）、用油图沼泽区减半步长做微操、用晶体传送跨越骨头墙（在骨头内起跳会承受 50% 生命伤害）、以及「传送兑水」（telepouring，在晶体传送途中兑基底）等社区技巧  [(fandom.com)](https://potion-craft.fandom.com/wiki/Ingredients) 。

### 3.7 经营循环：顾客、声望、名气与讨价还价

炼金之外是经营。每天顾客上门求药，玩家的选择会产生后果：卖给意图不轨的顾客（杀人越货、不正当关系）会大幅扣**声望**（Reputation，道德值，给恶人卖药一次能掉二三十点），拒绝恶单反而涨十点至二十点；声望一旦为负，当天将没有顾客上门  [(遊戲狂)](https://gamemad.com/guide/112999) 。**名气**（Popularity）则是知名度：拒绝或交不出货会掉名气，名气等级越高掉得越多；主线章节还要求名气逐级提升到 2、4、5、6、7、8、9、10、12、15 级  [(遊戲狂)](https://gamemad.com/guide/112999) 。

经验等级解锁四类天赋：地图视野扩大、经验书出现率提升、基础价格提升、讨价还价区间扩大  [(游侠攻略)](https://gl.ali213.net/html/2021-9/702475.html) 。讨价还价是个时机小游戏：箭头移动时点击图标争取有利落点，拖得越久对方优势越大；点满天赋后大额采购能砍到半价——3000 金的东西只收 1500，是名副其实的「开源节流神技」；但议价会减少交易获得的声望，小额订单往往得不偿失  [(游侠攻略)](https://gl.ali213.net/html/2021-9/702475.html) 。商人体系中最关键的是低概率出现的**同行炼金术士（Fellow Alchemist）**，他出售魔法纸、炼金机部件、盐配方与新基底  [(哔哩哔哩)](https://www.bilibili.com/opus/573879283687253869) ：

| 商品 | 价格（金） |
|---|---|
| 魔法纸（配方书 +1 页） | 150 |
| 炼金机部件（修复） | 2,000 |
| 基础炼金机升级 | 6,000 |
| 高级炼金机升级 | 12,000 |
| 虚空盐配方 | 4,000 |
| 月之盐配方 | 15,000 |
| 日之盐配方 | 24,000 |
| 生命之盐配方 | 32,000 |
| 贤者之盐配方 | 40,000 |
| 基底：油 | 8,000 |
| 基底：酒 | 15,000 |

### 3.8 炼金机与传说物质链：黑化 → 白化 → 黄化 → 红化 → 贤者之石

地下室的**炼金机（Alchemy Machine）**是游戏终局的核心。它起初是坏的：第三章从同行炼金术士处花 2,000 金购入部件修复（修好主炉、右炉与右侧五个玻璃容器），第五章花 6,000 金升级左侧，第七章再花 12,000 金完全解锁  [(fandom.com)](https://potion-craft.fandom.com/wiki/Alchemy_Machine) 。修复后，地下室可拾得**黑化（Nigredo）**的初始配方，此后每造出一种传说物质，即解锁下一级的残缺配方——**黑化 → 白化（Albedo）→ 黄化（Citrinitas）→ 红化（Rubedo）→ 贤者之石（Philosopher's Stone）**，完全复刻了伟大工作的经典四阶段并以哲人之石收束  [(fandom.com)](https://potion-craft.fandom.com/wiki/Alchemy_Machine) 。上一级产物同时是下一级的原料（如白化需黑化、黄化需白化），而且各阶段还有暗藏的效果要求：黑化需要减速与睡眠，白化需要魅惑，黄化需要狂怒，红化需要酸  [(Yori’s Little Shrine)](https://yori-room.com/potioncraft-legendary-recipe/) 。

**贤者之石**被 Wiki 直接称为「炼金术士的 Magnum Opus」，其配方在造出红化后解锁，需要完全升级的炼金机，原料为**一份红化 + 12 种药剂**，其中包括六瓶五效复合药剂（效果顺序不限，但每瓶须恰好盛入对应容器；全部就位后配方页打勾、拉杆高亮，拉动拉杆即在中央炉中成型） [(fandom.com)](https://potion-craft.fandom.com/wiki/Philosopher%27s_Stone) ：

| 组 | 内容 |
|---|---|
| 基料 | 红化 ×1 |
| 五防护 | 霜防护 I、闪电防护 I、毒防护 I、酸防护 I、火防护 I |
| 五攻击 | 中毒 I、火 I、爆炸 I、闪电 I、冰霜 I |
| 五增益 | 力量 I、石肤 I、迅捷 I、手巧 I、透视 I |
| 五回复 | 法力 I、治疗 I、狂野生长 I、光 I、性欲 I |
| 五隐匿 | 隐形 I、悬浮 I、恐惧 I、通灵 I、回春 I |
| 五变换 | 变大 I、胶着 I、反魔法 I、滑溜 I、缩小 I |
| 单剂 | 诅咒 III、恶臭 III、芳馨 III、幻觉 III、好运 III、灵感 III |

这份配方直接涉及 36 种效果（仅次于贤者之盐的 41 种）；加上黑化—红化各阶段隐含要求的减速、睡眠、魅惑、狂怒、酸，**等于要求玩家通关全部 41 种效果**  [(fandom.com)](https://potion-craft.fandom.com/wiki/Philosopher%27s_Stone) 。炼金机的 Wiki 页面还注明：不按任何配方乱投料会得到彩蛋产物「**未知物质（Unknown Substance）**」  [(fandom.com)](https://potion-craft.fandom.com/wiki/Alchemy_Machine) 。

![《药剂工艺》传说物质链](图1_药剂工艺传说物质链.png)

### 3.9 五种魔法盐

盐是传说物质的「产品形态」——除贤者之石留作终极收藏外，黑化到红化乃至贤者之石都可被消耗以制成对应的盐（制盐会吃掉原料，之后需要重做） [(fandom.com)](https://potion-craft.fandom.com/wiki/Life_Salt) 。五种盐均为容器盛装的颗粒，拖至坩埚上方即撒入，不可摧毁、不可出售、每种只能持有一罐，配方需先从同行炼金术士处购得（但若提前从外部渠道获知配方，也能直接合成） [(fandom.com)](https://potion-craft.fandom.com/wiki/Category:Salts) ：

| 盐 | 消耗原料 | 配方价格 | 效果 | 备注 |
|---|---|---|---|---|
| **虚空盐** | 黑化 | 4,000 | 逐渐擦除已绘制的路径 | 修正画错的路径  [(fandom.com)](https://potion-craft.fandom.com/wiki/Alchemy_Machine)  |
| **月之盐** | 白化 | 15,000 | 使药瓶与其路径**逆时针**旋转 | 处理左倾效果  [(fandom.com)](https://potion-craft.fandom.com/wiki/Alchemy_Machine)  |
| **日之盐** | 黄化 | 24,000 | 使药瓶与其路径**顺时针**旋转 | 处理右倾效果；竖直向下消耗 500 粒、转满一圈 1,000 粒，初始容量 20,000  [(fandom.com)](https://potion-craft.fandom.com/wiki/Alchemy_Machine)  |
| **生命之盐** | 红化 | 32,000 | 每粒恢复药剂 **0.4%** 生命 | 硬穿骨头墙的保险；配方为红化＋12 种药剂（治疗 III、狂野生长 III、性欲 III、通灵 III、回春 III、四防护＋反魔法、及六组双效 III/II 复合药）  [(fandom.com)](https://potion-craft.fandom.com/wiki/Alchemy_Machine)  |
| **贤者之盐** | 贤者之石 | 40,000 | 类似兑基底，但把药瓶**拉向最近的未获得效果**并自动对齐角度：每粒位移 0.0222 单位、旋转量等同月/日之盐 | 每批基础产量 2,500 粒；配方为贤者之石＋**12 瓶五效药剂**，涉及全部 41 种效果，公认是游戏的最终挑战  [(fandom.com)](https://potion-craft.fandom.com/wiki/Alchemy_Machine)  |

贤者之盐的 12 瓶五效药剂配方（每组五种效果，顺序不限）：芳馨/好运/灵感/恐惧/诅咒；幻觉/悬浮/性欲/酸/通灵；法力/透视/魅惑/狂怒/减速；力量/冰霜/睡眠/手巧/迅捷；变大/反魔法/缩小/酸防护/回春；霜防护/石肤/闪电防护/毒防护/火防护；胶着/恶臭/光/隐形/滑溜；狂野生长/中毒/火/爆炸/闪电；力量/治疗/手巧/法力/迅捷；法力/透视/幻觉/反魔法/好运；治疗/芳馨/回春/魅惑/性欲；狂怒/恐惧/变大/诅咒/通灵  [(fandom.com)](https://potion-craft.fandom.com/wiki/Philosopher%27s_Salt) 。哪怕在 2.0 简化了部分传说配方之后，首次造出贤者之盐依然「一如既往地磨人」——它被社区视为与成就等价的修行  [(TV Tropes)](https://tvtropes.org/pmwiki/pmwiki.php/VideoGame/PotionCraft) 。

### 3.10 实用配方选辑

以下配方整理自中文社区攻略，按用途分组（「研磨」指研磨程度，兑水位置与漩涡走法从略） [(教程之家)](https://www.jiaochengzhijia.com/game/pcgame/195177.html) ：

**基础药剂（水基底）**

| 药剂 | 原料 |
|---|---|
| 生命之水 | 水之花＋棕色蘑菇（I 型）；泰拉瑞亚＋沼泽菇（II 型） |
| 神力 | 风之花＋水之花＋影子鸡油菇；或巫术蘑菇＋影子鸡油菇 |
| 毒药 | 红色蘑菇＋泰拉瑞亚；或奇异菇＋火铃铛 |
| 火焰 | 毛蕉＋红色蘑菇 |
| 霜 | 冰果＋缠枝草；或沼泽菇＋缠枝草 |
| 闪电 | 块状甜菜＋雷蓟＋硫磺架 |
| 光 | 红色蘑菇＋风之花 |
| 爆炸 | 红色蘑菇＋雷蓟＋风之花＋硫磺架（需借漩涡） |
| 快速成长 | 棕色蘑菇＋绿色蘑菇＋棘条 |
| 睡眠 | 沼泽菇＋缠枝草＋水之花＋绿色蘑菇 |
| 透视 | 巫术蘑菇＋缠枝草＋水之花＋风之花 |
| 石肤 | 泰拉瑞亚＋棘条＋奇异菇＋树仙鞍菇 |
| 致幻 | 巫术蘑菇＋影子鸡油菇＋雷蓟 |
| 魅惑 | 风之花＋火铃铛＋硫磺架＋雷蓟＋云晶＋块状甜菜 |
| 酸 | 泰拉瑞亚＋火铃铛＋红色蘑菇＋棘条＋毛蕉＋奇异菇＋树仙鞍菇 |
| 减速 | 泰拉瑞亚＋沼泽菇＋地精菇＋棕色蘑菇＋奇异菇 |
| 弹跳 | 巫术蘑菇＋风之花＋雷蓟＋影子鸡油菇 |
| 本能 | 棘条＋红色蘑菇＋毛蕉＋火铃铛＋火黄晶＋泰拉瑞亚 |
| 狂战 | 毛蕉＋熔岩根茎＋火铃铛＋风之花＋红色蘑菇＋雷蓟＋块状甜菜（需提前兑水） |
| 隐身 | 雷蓟＋水之花＋风之花＋块状甜菜＋巫术蘑菇＋影子鸡油菇＋硫磺架（需借漩涡） |
| 悬浮 | 影子鸡油菇＋雷蓟＋风之花＋云晶＋硫磺架＋火铃铛（需借漩涡） |
| 收获 | 块状甜菜＋水之花＋缠枝草＋沼泽菇＋影子鸡油菇＋冰果（需提前兑水） |
| 通灵 | 棕色蘑菇＋绿色蘑菇＋泰拉瑞亚＋奇异菇＋沼泽菇＋棘条＋块状甜菜＋水之花＋风之花＋雷蓟（不研磨）＋缠枝草（不研磨）＋地精菇＋冰果＋火铃铛（路径取巧，需中途兑水） |

**III 级强效药剂示例**

| 药剂 | 配方与要点 |
|---|---|
| 火焰 III | 3 火铃铛：1 个研磨至最高点、2 个研磨，兑基底回中心即可  [(逗游网)](https://www.doyo.cn/article/503088)  |
| 睡眠 III | 4 水之花＋1 生命叶＋1 泰拉瑞亚：3 水之花研磨、1 生命叶研磨、1 水之花不研磨、泰拉瑞亚不研磨；或 1 水之花＋2 缠枝草＋1 金棘（研磨至睡眠右下方）  [(游侠攻略)](https://gl.ali213.net/html/2023-1/983003.html)  |
| 魅惑 III | 5 风之花＋1 疯癫蘑菇＋1 火铃铛：三朵研磨、一朵磨 60%、火铃铛磨至触碰漩涡，借漩涡停在左下方后兑水回中心；或 1 血棘＋2 风之花＋1 疯癫蘑菇  [(游侠攻略)](https://gl.ali213.net/html/2023-1/982973.html)  |
| 透视 III | 3 水之花＋1 风之花＋1 巫术蘑菇：水之花磨至最高点，借漩涡停在右上方  [(yxss.com)](https://www.yxss.com/gl/57961.html)  |

**后期单质＋盐极简配方示例**（第五章后思路）：好运药剂 5 幻影裙＋426 日之盐；诅咒药剂 5 墓穴松露＋440 月之盐；通灵药剂 7 墓穴松露＋45 日之盐；芳馨药剂 13 生命叶＋371 月之盐  [(游侠攻略)](https://gl.ali213.net/html/2024-9/1512027.html) 。社区还发展出整套「挑战命名法」来交流极限配方：Dry（禁兑基底）、Highlander（原料不重复）、Lowlander（只用一种原料）、Dull（禁盐）、Scholarly（只用贤者之盐）等  [(fandom.com)](https://potion-craft.fandom.com/wiki/Optimizing) 。

---

## 四、三重镜像：对比与统一

### 4.1 核心理念对照

三者相隔约一千年——一部中古文本、两款当代游戏——却共享同一套炼金术母题。下表做集中对照：

| 维度 | 《翠玉录》 | 《Noita》 | 《药剂工艺：炼金模拟器》 |
|---|---|---|---|
| **宇宙观** | 下如同上、上如同下：大宇宙与小宇宙互为映射  [(百度百科)](https://baike.baidu.com/item/%E7%BF%A0%E7%8E%89%E5%BD%95/4579712)  | 世界即坩埚：逐像素材料引擎让「万物皆可反应」成为物理事实  [(wiki.gg)](https://noita.wiki.gg/wiki/Alchemy)  | 地图即宇宙：炼金过程被抽象为空间中的航行  [(fandom.com)](https://potion-craft.fandom.com/wiki/Alchemy_Map)  |
| **物质观** | 万物本是太一，藉由分化而创造  [(百度百科)](https://baike.baidu.com/item/%E7%BF%A0%E7%8E%89%E5%BD%95/4579712)  | 世界种子即「太一」：两大圣物配方由种子分化而来，人人不同  [(fandom.com)](https://noita.fandom.com/wiki/Random_Materials)  | 原料即元素：罗盘方向与路径是每种物质的「本性」  [(fandom.com)](https://potion-craft.fandom.com/wiki/Ingredients)  |
| **指导思想** | 分土于火、萃精于糙；从地升天、又从天而降  [(百度百科)](https://baike.baidu.com/item/%E7%BF%A0%E7%8E%89%E5%BD%95/4579712)  | 主成分＋催化剂→产物；以体积守恒与自我复制放大成果  [(fandom.com)](https://noita.fandom.com/zh/wiki/%E7%82%BC%E9%87%91?variant=zh-cn)  | 研磨—搅拌—加热—兑基底；路径规划与精确对齐  [(fandom.com)](https://potion-craft.fandom.com/wiki/Potions)  |
| **嬗变实践** | 哲人之石点化贱金属  [(百度百科)](https://baike.baidu.com/item/%E7%BF%A0%E7%8E%89%E5%BD%95/4579712)  | 金属嬗变链（钻石→银→铜→黄铜）＋逆向合成；点金之水/点金之气化万物为金  [(fandom.com)](https://noita.fandom.com/zh/wiki/%E7%82%BC%E9%87%91?variant=zh-cn)  | 41 种效果的互相组合与提纯，I→II→III 级对齐  [(fandom.com)](https://potion-craft.fandom.com/wiki/Potions)  |
| **终极产物** | 哲人之石与灵丹妙药（Elixir）  [(百度百科)](https://baike.baidu.com/item/%E7%BF%A0%E7%8E%89%E5%BD%95/4579712)  | 点金之水（嬗变）与活性混合物质（万能药）——Wiki 明言对应 transmutation 与 panacea  [(wiki.gg)](https://noita.wiki.gg/wiki/Alchemy)  | 贤者之石（Magnum Opus）与贤者之盐  [(fandom.com)](https://potion-craft.fandom.com/wiki/Philosopher%27s_Stone)  |
| **流程结构** | 分离—循环—落实三步；后世展开为黑化/白化/黄化/红化四阶段  [(百度百科)](https://baike.baidu.com/item/%E7%BF%A0%E7%8E%89%E5%BD%95/4579712)  | 观察—采样—试混—增殖；真菌转换改写世界规则  [(wiki.gg)](https://noita.wiki.gg/wiki/Alchemic_Precursor)  | 黑化→白化→黄化→红化→贤者之石，主线章节逐一对应  [(fandom.com)](https://potion-craft.fandom.com/wiki/Alchemy_Machine)  |
| **知识形态** | 十三条箴言，挂在作坊墙上的最终指导  [(百度百科)](https://baike.baidu.com/item/%E7%BF%A0%E7%8E%89%E5%BD%95/4579712)  | 翠玉板残页与炼金术士团笔记——知识已随教团湮灭，由玩家重新发现  [(fandom.com)](https://villains.fandom.com/wiki/Alchemists_(Noita))  | 配方书一页页购得、残缺配方逐级解锁  [(fandom.com)](https://potion-craft.fandom.com/wiki/Alchemy_Machine)  |
| **炼金术士形象** | 三重伟大的赫尔墨斯  [(百度百科)](https://baike.baidu.com/item/%E7%BF%A0%E7%8E%89%E5%BD%95/4579712)  | 死亡、变异或飞升的古代炼金术士；玩家作为「女巫」继承其业  [(fandom.com)](https://villains.fandom.com/wiki/Alchemists_(Noita))  | 玩家本人：开店营业、修行伟大工作的当代炼金术士  [(indienova 独立游戏)](https://indienova.com/game/potion-craft)  |

### 4.2 伟大工作的三种演绎

《翠玉录》把伟大工作浓缩为「太阳的工作」一句话，后世炼金哲学将其展开为黑化（坠入黑暗）、白化（净化之光）、黄化（心智之光）、红化（灵魂合一）四个阶段  [(百度百科)](https://baike.baidu.com/item/%E7%BF%A0%E7%8E%89%E5%BD%95/4579712) 。两款游戏各自把这条路径走了一遍，只是方式不同。

《药剂工艺》是**字面意义上**的复刻：玩家先修复象征工坊的炼金机，再依次炼成黑化、白化、黄化、红化，最终合成贤者之石——配方页上那一行「The Alchemist's Magnum Opus」毫不掩饰其出处  [(fandom.com)](https://potion-craft.fandom.com/wiki/Alchemy_Machine) 。更具设计感的是，它把传统炼金的四阶段做成了**自举（bootstrapping）结构**：每一级产物既是下一级的原料，又是制盐的材料，贤者之石本身则是贤者之盐的原料——「万物本是太一，藉由分化而创造」在这里变成了一条真实的生产链  [(Yori’s Little Shrine)](https://yori-room.com/potioncraft-legendary-recipe/) 。而 41 种效果全收集的硬性要求，则是对「得世界的荣耀、远离黑暗蒙昧」的游戏化转译：只有遍历过地图上每一个角落的炼金术士，才配得上完成伟大工作  [(fandom.com)](https://potion-craft.fandom.com/wiki/Philosopher%27s_Stone) 。

《Noita》则把伟大工作写进了**世界本身**：地下的炼金术士团研究「the Work」而未竟，化为废墟、怪物与翠玉板残页；终局隐藏区域干脆命名为「伟大之作（地狱）」与「伟大之作（天空）」——恰好对应《翠玉录》「从地升天，又从天而降」的两极  [(fandom.com)](https://villains.fandom.com/wiki/Alchemists_(Noita)) 。玩家在游戏里复现炼金术士团的未竟之业：寻找失落的配方、完成点金与万能药、乃至用真菌转换直接改写宇宙的材质规则——「你感觉到宇宙的规则变换了」这句系统提示，几乎是「世界即如此创造，依此可达奇迹」的交互式回声  [(wiki.gg)](https://noita.wiki.gg/zh/wiki/%E7%9C%9F%E8%8F%8C%E8%BD%AC%E6%8D%A2?variant=zh-cn) 。

### 4.3 结语

把三者并置，可以看到一条清晰的谱系。**《翠玉录》提供思想**：上下对应的宇宙论、太一生万物的物质观、分离与循环的方法论、伟大工作的终极叙事——此后一切西方炼金实践都在为它作注  [(百度百科)](https://baike.baidu.com/item/%E7%BF%A0%E7%8E%89%E5%BD%95/4579712) 。**《Noita》提供涌现**：它把「万物皆可嬗变」落实为一台材料反应引擎，让炼金从玩家背诵的知识变成世界自发生成的现象——配方藏在种子里，正如秘密藏在洞穴里，等待发现而非学习  [(wiki.gg)](https://noita.wiki.gg/wiki/Alchemy) 。**《药剂工艺》提供流程**：它把炼金抽象为可传授、可复现、可经营的完整工艺——从研磨的一杵到贤者之盐的最后一粒，伟大工作被拆解为十万次精确的操作  [(fandom.com)](https://potion-craft.fandom.com/wiki/Potions) 。

「分土于火，萃精于糙，谨慎行之」——《翠玉录》第六条箴言里的「温和而勤勉」，或许是对三者最准确的共同注解：无论是在文本中参悟、在像素世界里试错，还是在炼金地图上精算每一步路径，炼金术的核心从来不是点石成金的结果，而是那个**分离、提纯、再凝聚**的过程本身。物质的重造与心灵的重塑，在同一个坩埚里完成  [(百度百科)](https://baike.baidu.com/item/%E7%BF%A0%E7%8E%89%E5%BD%95/4579712) 。

![三重镜像对照](图3_三重镜像对照.png)

---
 [(fandom.com)](https://noita.fandom.com/zh/wiki/%E7%82%BC%E9%87%91?variant=zh-cn) : https://noita.fandom.com/zh/wiki/%E7%82%BC%E9%87%91
 [(wiki.gg)](https://noita.wiki.gg/zh/wiki/%E7%9C%9F%E8%8F%8C%E8%BD%AC%E6%8D%A2?variant=zh-cn) : https://noita.wiki.gg/zh/wiki/%E7%9C%9F%E8%8F%8C%E8%BD%AC%E6%8D%A2
 [(百度百科)](https://baike.baidu.com/item/%E7%BF%A0%E7%8E%89%E5%BD%95/4579712) : https://baike.baidu.com/item/%E7%BF%A0%E7%8E%89%E5%BD%95/4579712
 [(游侠攻略)](https://gl.ali213.net/html/2024-9/1512027.html) : https://gl.ali213.net/html/2024-9/1512027.html
 [(游侠攻略)](https://gl.ali213.net/html/2023-1/982973.html) : https://gl.ali213.net/html/2023-1/982973.html
 [(游侠攻略)](https://gl.ali213.net/html/2023-1/983003.html) : https://gl.ali213.net/html/2023-1/983003.html
 [(教程之家)](https://www.jiaochengzhijia.com/game/pcgame/195177.html) : https://www.jiaochengzhijia.com/game/pcgame/195177.html
 [(indienova 独立游戏)](https://indienova.com/game/potion-craft) : https://indienova.com/game/potion-craft
 [(yxss.com)](https://www.yxss.com/gl/57961.html) : https://www.yxss.com/gl/57961.html
 [(逗游网)](https://www.doyo.cn/article/503088) : https://www.doyo.cn/article/503088
 [(wiki.gg)](https://noita.wiki.gg/wiki/Alchemic_Precursor) : https://noita.wiki.gg/wiki/Alchemic_Precursor
 [(Yori’s Little Shrine)](https://yori-room.com/potioncraft-legendary-recipe/) : https://yori-room.com/potioncraft-legendary-recipe/
 [(wiki.gg)](https://noita.wiki.gg/wiki/Alchemy) : https://noita.wiki.gg/wiki/Alchemy
 [(Amazon Singapore)](https://www.amazon.sg/Emerald-Tablet-Hermes-Smaragdine-Smaragdina/dp/1977921825) : https://www.amazon.sg/Emerald-Tablet-Hermes-Smaragdine-Smaragdina/dp/1977921825
 [(fandom.com)](https://potion-craft.fandom.com/wiki/Philosopher%27s_Stone) : https://potion-craft.fandom.com/wiki/Philosopher%27s_Stone
 [(Azonomy)](https://azonomy.co.uk/emerald-tablet-myth/?srsltid=AfmBOooNytsRVEhz2vXgob1533-oNEzH7vviZ23fBVGpi7oWcS5JN5G5) : https://azonomy.co.uk/emerald-tablet-myth/
 [(Britannica)](https://www.britannica.com/topic/Emerald-Tablet) : https://www.britannica.com/topic/Emerald-Tablet
 [(fandom.com)](https://noita.fandom.com/wiki/Alchemy) : https://noita.fandom.com/wiki/Alchemy
 [(Internet Sacred Text Archive)](https://sacred-texts.com/alc/emerald.htm) : https://sacred-texts.com/alc/emerald.htm
 [(spiritmaji.com)](https://files.spiritmaji.com/books/Hermetics/emeraldtablet.pdf) : https://files.spiritmaji.com/books/Hermetics/emeraldtablet.pdf
 [(fandom.com)](https://potion-craft.fandom.com/wiki/Category:Legendary_substances) : https://potion-craft.fandom.com/wiki/Category:Legendary_substances
 [(fandom.com)](https://potion-craft.fandom.com/wiki/Potions) : https://potion-craft.fandom.com/wiki/Potions
 [(fandom.com)](https://potion-craft.fandom.com/wiki/Ingredients) : https://potion-craft.fandom.com/wiki/Ingredients
 [(fandom.com)](https://potion-craft.fandom.com/wiki/Alchemy_Map) : https://potion-craft.fandom.com/wiki/Alchemy_Map
 [(fandom.com)](https://noita.fandom.com/wiki/Fungal_Reality_Shift) : https://noita.fandom.com/wiki/Fungal_Reality_Shift
 [(fandom.com)](https://noita.fandom.com/wiki/Random_Materials) : https://noita.fandom.com/wiki/Random_Materials
 [(fandom.com)](https://potion-craft.fandom.com/wiki/Effects) : https://potion-craft.fandom.com/wiki/Effects
 [(机核 GCORES)](https://www.gcores.com/articles/197035) : https://www.gcores.com/articles/197035
 [(百度百科)](https://baike.baidu.com/item/%E7%BA%A2%E5%8C%96/62443808) : https://baike.baidu.com/item/%E7%BA%A2%E5%8C%96/62443808
 [(wiki.gg)](https://noita.wiki.gg/wiki/Fungal_Reality_Shift) : https://noita.wiki.gg/wiki/Fungal_Reality_Shift
 [(fandom.com)](https://potion-craft.fandom.com/wiki/Alchemy_Machine) : https://potion-craft.fandom.com/wiki/Alchemy_Machine
 [(fandom.com)](https://potion-craft.fandom.com/wiki/Optimizing) : https://potion-craft.fandom.com/wiki/Optimizing
 [(fandom.com)](https://potion-craft.fandom.com/wiki/Philosopher%27s_Salt) : https://potion-craft.fandom.com/wiki/Philosopher%27s_Salt
 [(fandom.com)](https://potion-craft.fandom.com/wiki/Life_Salt) : https://potion-craft.fandom.com/wiki/Life_Salt
 [(fandom.com)](https://potion-craft.fandom.com/wiki/Fellow_Alchemist) : https://potion-craft.fandom.com/wiki/Fellow_Alchemist
 [(fandom.com)](https://potion-craft.fandom.com/wiki/Category:Salts) : https://potion-craft.fandom.com/wiki/Category:Salts
 [(fandom.com)](https://potion-craft.fandom.com/wiki/The_Alchemist%27s_Path) : https://potion-craft.fandom.com/wiki/The_Alchemist%27s_Path
 [(Gameplay.tips)](https://gameplay.tips/guides/potion-craft-alchemist-simulator-ultimate-alchemy-guide.html) : https://gameplay.tips/guides/potion-craft-alchemist-simulator-ultimate-alchemy-guide.html
 [(哔哩哔哩)](https://www.bilibili.com/opus/573879283687253869) : https://www.bilibili.com/opus/573879283687253869
 [(游侠攻略)](https://gl.ali213.net/html/2021-9/702475.html) : https://gl.ali213.net/html/2021-9/702475.html
 [(Yori’s Little Shrine)](https://yori-room.com/potioncraft-sunsalt/) : https://yori-room.com/potioncraft-sunsalt/
 [(TV Tropes)](https://tvtropes.org/pmwiki/pmwiki.php/VideoGame/PotionCraft) : https://tvtropes.org/pmwiki/pmwiki.php/VideoGame/PotionCraft
 [(东方体育)](https://sports.eastday.com/a/211004180659925595656.html) : https://sports.eastday.com/a/211004180659925595656.html
 [(遊戲狂)](https://gamemad.com/guide/112999) : https://gamemad.com/guide/112999
 [(fandom.com)](https://villains.fandom.com/wiki/Alchemists_(Noita)) : https://villains.fandom.com/wiki/Alchemists_(Noita)
 [(wiki.gg)](https://noita.wiki.gg/wiki/Ylialkemisti) : https://noita.wiki.gg/wiki/Ylialkemisti
 [(wiki.gg)](https://noita.wiki.gg/zh/wiki/%E6%8C%89%E7%94%9F%E7%89%A9%E7%BE%A4%E7%B3%BB%E5%88%92%E5%88%86%E6%95%8C%E4%BA%BA?variant=zh-hans) : https://noita.wiki.gg/zh/wiki/%E6%8C%89%E7%94%9F%E7%89%A9%E7%BE%A4%E7%B3%BB%E5%88%92%E5%88%86%E6%95%8C%E4%BA%BA
 [(wiki.gg)](https://noita.wiki.gg/zh/wiki/%E6%8B%9F%E6%80%81%E4%B9%8B%E6%B5%B7?variant=zh-cn) : https://noita.wiki.gg/zh/wiki/%E6%8B%9F%E6%80%81%E4%B9%8B%E6%B5%B7
