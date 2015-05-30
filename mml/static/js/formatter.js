/**
 * Represent both the converted HTML and the original MML as a 
 * linked list, where common text is preserved at the points where 
 * it diverges. This is to speed up conversion and also to allow 
 * correspondences between the MML and HTML to be used during editing.
 */
function Link(mml,html,text,next,prev)
{
    this.mml = mml;
    this.html = html;
    this.text = text;
    this.next = next;
    this.prev = prev;
    /**
     * Convert this link and all its subsequent ones into HTML
     * @return a valid HTML document
     */
    this.toHtml = function() {
        var temp = this;
        var html = "";
        while ( temp != null )
        {
            html += temp.html;
            html += temp.text;
            temp = temp.next;
        }
        return html;
    };
    /**
     * Convert this link and all subsequent ones into the original textarea text
     * @return the original textarea contents
     */
    this.toMml = function() {
        var temp = this;
        var mml = "";
        while ( temp != null )
        {
            mml += temp.mml;
            mml += temp.text;
            temp = temp.next;
        }
        return mml;
    };
    /**
     * Does this link contain no actual text until the next node?
     * @param end the final node of the sequence    
     * @return true if it was empty
     */
    this.isEmpty = function(end) {
        var temp = this;
        while ( temp != null )
        {
            for ( var i=0;i<temp.text.length;i++ )
            {
                var c = temp.text.charAt(i);
                if ( c!='\t'||c!=' '||c!= '\n' )
                    return false;
            }
            temp = temp.next;
        }
        return true;
    };
    this.prependHtml= function( html ) {
        this.html = html + this.html;
    };
    this.prependMml = function( mml ) {
        this.mml = mml + this.mml;
    };
    /**
     * Split a link at a known place
     * @param pos the offset into the text of the link to split at
     * @param numDel number of character to delete after split point
     * @return the new link in the middle
     */
    this.split = function(pos,numDel) {
        var left = this.text.substr(0,pos);
        var right = this.text.substr(pos+numDel);
        var link = new Link("","",right,this.next,this);
        this.text = left;
        this.next.prev = link;
        this.next = link;
        return link;
    };
    /**
     * Used by print: abbreviate the text content of a link
     * @param text the text to abbreviate
     */
    this.abbrev = function(text) {
        if ( text.length > 10 )
            return text.substr(0,5)+"..."+text.substr(text.length-6);
        else
            return text;
    }
    /**
     * Print an abbreviated version of the list to th console
     */
    this.print = function() {
        var temp = this;
        while ( temp != null )
        {
            console.log("\""+temp.html+"\"|\""+temp.mml+"\""+this.abbrev(temp.text)+"->");
            temp = temp.next;
        }
    };
}
/**
 * Format an MML text into HTML using a dialect
 * @param dialect the dialect to use
 */
function Formatter( dialect ) 
{
    /** dialect file of MML */
    this.dialect = dialect;
    /** quote chars for smartquotes */
    this.quotes = {"'":1,"‘":1,"’":1,'"':1,'”':1,'“':1};
    /** number of lines in textarea source */
    this.num_lines = 0;
    /** flag to indicate we are NOT busy */
    this.ready = true;
    /** conversion table from mml offsets to html base text ones */
    this.mmlToHtml = undefined;
    /**
     * Build quick lookup arrays for making headings
     */
    this.buildHeadLookup = function() {
        this.heads = {};
        this.tags = {};
        for ( var i=0;i<this.dialect.headings.length;i++ )
        {
            if ( this.dialect.headings[i].prop != undefined 
                && this.dialect.headings[i].tag != undefined )
            {
                this.heads[this.dialect.headings[i].tag] 
                    = this.dialect.headings[i].prop;    
                this.tags[this.dialect.headings[i].prop] = 'h'+(i+1);
            }
        } 
    };
    /**
     * Build quick lookup arrays for dividers
     */
     this.buildDividerLookup = function() {
        var divs = this.dialect.dividers;
        this.dividers = {};
        for ( var k=0;k<divs.length;k++ )
        {
            var div = divs[k];
            if ( div.tag != undefined )
                this.dividers[div.tag] = (div.prop!=undefined)?div.prop:div.tag;
        }
    };
    /**
     * Build quick lookup for character formats
     */
     this.buildCfmtLookup = function() {
        var cfmts = this.dialect.charformats;
        this.cfmts = {};
        for ( var k=0;k<cfmts.length;k++ )
        {
            var cfmt = cfmts[k];
            if ( cfmt.tag != undefined )
                this.cfmts[cfmt.tag] = (cfmt.prop!=undefined)?cfmt.prop:cfmt.tag;
        }
    };
    /**
     * This should be a function of Array
     * @param the Array to test
     * @return the last element of Array, which is NOT modified
     */
    this.peek = function( stack )
    {
        return (stack.length==0)?undefined:stack[stack.length-1];
    };
    /**
     * Make a generic divider. It is a table with four cells.
     * @param prop the class name of the table and cell properties
     * @return the HTML table with class names suitable for CSS
     */
    this.makeDivider = function( prop )
    {
        var sb = "";
        sb += '<table class="';
        sb += prop;
        sb += '" title="';
        sb += prop;
        sb += '"><tr><td class="';
        sb += prop;
        sb += '-lefttop">';
        sb += "</td>";
        sb += '<td class="';
        sb += prop;
        sb += '-righttop">';
        sb += "</td></tr>";
        sb += '<tr><td class="';
        sb += prop;
        sb += '-leftbot">';
        sb += "</td>";
        sb += '<td class="';
        sb += prop;
        sb += '-rightbot">';
        sb += "</td></tr>";
        sb += "</table>";
        return sb;
    };
    /**
     * Process a paragraph for possible dividers
     * @param para the paragraph to process
     * @param end the next paragraph
     */
    this.processDividers = function(para,end)
    {
        if ( this.dialect.dividers!=undefined )
        {
            var line = para.next;
            while ( line != end && line != null )
            {
                var tag = line.text.trim();
                if ( tag in this.dividers )
                {
                    line.html = this.makeDivider( this.dividers[tag] );
                    line.mml += line.text;
                    line.text = "";
                    this.formatted = true;
                }
                line = line.next;
            }
        }
    };
    /**
     * Get a curly close quote character 
     * @param quote the quote to convert
     * @return the Unicode curly variant
    */
    this.closeQuote = function( quote )
    {
        if ( quote=="'" )
            return "’";
        else if ( quote == '"' )
            return '”';
        else
            return quote;
    };
    /**
     * Get a curly opening quote character 
     * @param quote the quote to convert
     * @return the Unicode curly variant
    */
    this.openQuote = function( quote )
    {
        if ( quote=="'" )
            return "‘";
        else if ( quote == '"' )
            return '“';
        else
            return quote;
    };
    /**
     * Is this a curly or straight quote char?
     * @param c the quote to test
     * @return true if it is
     */
    this.isQuote= function( c )
    {
        return c in this.quotes;
    };
    /**
     * Is this a plain space char?
     * @param c the char to test
     * @return true if it is
     */
    this.isSpace = function( c )
    {
        return c == '\t'||c==' ';
    };
    /**
     * Is this an opening bracket of some kind?
     * @param c the char to test
     * @return true if it is
     */
    this.isOpeningBracket = function(c)
    {
        return c=='['||c=='('||c=='{'||c=='<';
    };
    /**
     * Specifically test for an opening quote char
     * @param c the char to test
     * @return true if it is
     */
    this.isOpeningQuote = function(c)
    {
        return c=="‘"||c=='“';
    };
    /**
     * Search for and replace all character formats in the paragraph
     * @param para the lead link of the paragraph
     * @param end the next paragraph or end-link
     */ 
    this.processCfmts = function(para,end)
    {
        if ( this.dialect.charformats != undefined )
        {
            var trimNextLF = false;
            var stack = new Array();
            var line = para.next;
            while ( line != null && line != end )
            {
                var text = line.text;
                // trim leading LF after hyphen
                if ( trimNextLF )
                {
                    if ( line.html.length>0&&line.html[0]=='\n' )
                        line.html = line.html.substr(1);
                    trimNextLF = false;
                }
                var i = 0;
                while ( i<text.length )
                {
                    var c = text[i++];
                    if ( c in this.cfmts )
                    {
                        var link = line.split(i-1,1);
                        if ( this.peek(stack)==c )
                        {
                            stack.pop();
                            link.html = '</span>';
                            link.mml = c;
                        }
                        else
                        {
                            stack.push(c);
                            link.html = '<span class="'
                                +this.cfmts[c]
                                +'" title="'+this.cfmts[c]+'">'
                            link.mml = c;
                        }
                        line = link;
                        text = line.text;
                        i = 0;
                    }
                    else if ( c == '-' && i==text.length )
                    {
                        var link = line.split(i-1,1);
                        var hyphen = new Link("",'<span class="soft-hyphen">',
                            "-",link,line);
                        line.next = hyphen;
                        link.prev = hyphen;
                        link.html = '</span>';
                        line = link;    // needed for loop termination
                        text = line.text;
                        trimNextLF = true;
                        i = 0;
                    } 
                }
                line = line.next;
            }
        }
    };
    /**
     * Find start of tag after leading white space
     * @param text the text to search
     * @param tag the tag to find at the end
     * @return -1 on failure else index of tag-start at end of text
     */
    this.startPos = function( text, tag )
    {
        var i = 0;
        while ( i<text.length&&(text.charAt(i)=='\t'||text.charAt(i)==' ') )
            i++;
        if ( text.indexOf(tag)==i )
            return i;
        else
            return -1;
    };
    /**
     * Find the last instance of tag before trailing white space
     * @param text the text to search
     * @param tag the tag to find at the end
     * @return -1 on failure else index of tag-start at end of text
     */
    this.endPos = function( text, tag )
    {
        var i = text.length-1;
        while ( i>=0 )
        {
            if ( text[i]==' '||text[i]=='\n'||text[i]=='\t' )
                i--;
            else
                break;
        }
        var j = tag.length-1;
        while ( j >= 0 )
        {
            if ( tag[j] != text[i] )
                break;
            else
            {
                j--;
                i--;
            }
        }
        return (j==-1)?i+1:-1;
    };
    /**
     * Scan the start and end of the paragraph for defined para formats.
     * @param para the link leading into the paragraph 
     * @param end the link of the next paragraph
     */
    this.processPfmts = function( para, end )
    {
        if ( this.dialect.paraformats !=undefined )
        {
            var pfmts = this.dialect.paraformats;
            var line = para.next;
            for ( var i=0;i<pfmts.length;i++ )
            {
                var pfmt = pfmts[i];
                if ( pfmt.leftTag != undefined && pfmt.rightTag != undefined )
                {
                    var ltag = pfmt.leftTag;
                    var lpos = this.startPos(para.next.text,ltag);
                    if ( lpos != -1 )
                    {
                        var rtag = pfmt.rightTag;
                        var last = end.prev;
                        while ( last != para && last != null )
                        {
                            var rpos = this.endPos(last.text,rtag);
                            if ( rpos != -1 )
                            {
                                line.html += '<p class="'+pfmt.prop+'"'
                                    +' title="'+pfmt.prop+'">';
                                line.text = line.text.substr(lpos+ltag.length);
                                line.mml += para.next.text.substr(0,lpos+ltag.length);
                                last.prependMml(last.text.substr(rpos));
                                // recompute
                                rpos = this.endPos(last.text,rtag);
                                last.text = last.text.substr(0,rpos);
                                last.next.prependHtml('</p>');
                                this.formatted = true;
                                break;
                            }
                            last = last.prev;
                        }
                    }
                }
            }
        }
    };
    /**
     * Get the quote depth of the current line
     * @paramline the text of the line to test for leading >s
     * @return the number of leading >s followed by spaces
     */
    this.quoteDepth = function( line )
    {
        var state = 0;
        var depth = 0;
        for ( var i=0;i<line.length;i++ )
        {
            var c = line.charAt(i);
            switch ( state )
            {
                case 0: // looking for ">"
                    if ( c=='>' )
                    {
                        depth++;
                        state = 1;
                    }
                    else if ( c!=' '&&c!='\t' )
                        state = -1;
                    break;
                case 1: // looking for obligatory space
                    if ( c==' '||c=='\t' )
                        state = 0;
                    else
                        state = -1;
                    break;
        
            }
            if ( state == -1 )
                break;
        }
        return depth;
    };
    /**
     * Strip the leading quotations from a link and put into mml
     * @param line
     */
    this.stripQuotations = function( link )
    {
        var i = 0;
        var line = link.text;
        var c = (line.length>0)?line.charAt(0):undefined;
        if ( this.startPos(line,">")==0 )
        {
            while ( i<line.length && (c=='>'||c=='\t'||c==' ') )
            {
                i++;
                if ( i < line.length )
                    c = line.charAt(i);
            }
        }
        link.mml += line.substr(0,i);
        link.text = line.slice(i);
    };
    /**
     * Quotations are lines starting with "> "
     * @param para the paragraph to scan for quotations and convert
     * @param end the next paragraph link
     */
    this.processQuotations = function(para, end)
    {
        if ( this.dialect.quotations != undefined )
        {
            var old;
            var res = "";
            var attr = (this.dialect.quotations.prop!=undefined
                &&this.dialect.quotations.prop.length>0)
                ?' class="'+this.dialect.quotations.prop+'"':"";
            var stack = new Array();
            var line = para.next;
            while ( line != end && line != null )
            {
                var depth = this.quoteDepth(line.text);
                if ( depth > 0 )
                {
                    if ( this.peek(stack) != depth )
                    {
                        if ( stack.length==0||this.peek(stack)<depth )
                        {
                            for ( var j=stack.length;j<depth;j++ )
                                line.html += "<blockquote"+attr+'>';
                            stack.push(depth);
                        }
                        else if ( depth < this.peek(stack) )
                        {
                            old = stack.pop();
                            while ( old != undefined && old>depth )
                            {
                                line.prependHtml("</blockquote>");
                                depth = old;
                            }
                        }
                    }
                    this.stripQuotations(line);
                    this.html += "\n";
                }
                line = line.next;
            }
            line = end.prev;
            old = this.peek(stack);
            while ( old != undefined && old > 0 )
            {
                old = stack.pop();
                if ( old != undefined )
                    line.prependHtml("</blockquote>");
            }
            if ( this.startPos(para.next.html,"<blockquote")==0 
                && this.startPos(line.html,"</blockquote>")==0 )
                this.formatted = true;
        }
    };
    /**
     * Does the given line define a heading for the line above?
     * @param line the line to test - should be all the same character
     * @param c the character that should be uniform
     * @return true if it qualifies
     */
    this.isHeading = function( line, c )
    {
        var j = 0;
        for ( ;j<line.length;j++ )
        {
            if ( line.charAt(j) !=c )
                break;  
        }
        return j == line.length;
    };
    /**
     * Process setext type headings (we don't do atx). Oh, and do milestones.
     * @param para the link whose content needs its headings processed
     * @param end the start of the next paragraph or link
     */
    this.processHeadings = function( para, end )
    {
        if ( this.dialect.headings !=undefined )
        {
            var res = "";
            var mss = (this.dialect.milestones!=undefined
                &&this.dialect.milestones.length>0)
                ?this.dialect.milestones:undefined;
            var link = para.next;
            while ( link != end && link != null )
            {
                var ms;
                var line = link.text;
                if ( line.length > 0 )
                {
                    var c = line.charAt(0);
                    // process headings
                    if ( c in this.heads && this.isHeading(line,c) )
                    {
                        var attr = ' class="'+this.heads[c]+'" title="'+this.heads[c]+'"';
                        link.prev.html += '<'+this.tags[this.heads[c]]+attr+'>';
                        link.mml += link.text;
                        link.text = "";
                        link.prependHtml('</'+this.tags[this.heads[c]]+'>\n');
                        this.formatted = true; 
                    }
                    // process milestones
                    else if ( mss != undefined 
                        && (ms=this.isMilestone(line,mss))!=undefined )
                    {
                        while ( line.length>0&&(line.charAt(0)==' '
                            ||line.charAt(0)=='\t') )
                        {
                            link.mml += line.charAt(0);
                            line = line.substr(1);
                        }
                        var endPos = this.endPos(line,ms.rightTag);
                        var ref = line.slice(ms.leftTag.length,endPos);
                        link.mml += ms.leftTag;
                        link.next.prependMml(line.substr(endPos));
                        if ( ms.prop=="page" )
                        {
                            //console.log("ref="+ref+" num_lines="+this.num_lines);
                            this.text_lines.push(new RefLoc(ref,this.num_lines));
                        }
                        link.text = ref;
                        link.html += '<span class="'+ms.prop+'">';
                        link.next.prependHtml('</span>');
                    }
                    else if ( link.next == end )
                    {
                        link.html += '\n';
                    }
                    else
                    {
                        var next = link.next.text;
                        var d = next.charAt(0);
                        if ( !(d in this.heads && this.isHeading(next,d)) )
                        {
                            link.html += '\n';
                        }
                    }
                }
                this.num_lines += this.countLines(link.mml);
                link = link.next;
            }
        }
    };
    /**
     * Remove leading white space. If no such whitespace do nothing.
     * @param link the link whose leading ws is to be removed
     * @param level the level of the preformatting
     * @return the leading white space
     */
    this.leadTrim = function(link,level)
    {
        var trimmed = "";
        var line = link.text;
        for ( var i=0;i<level;i++ )
        {
            if ( line.indexOf("    ")==0 )
            {
                line = line.substr(4);
                trimmed += "    ";
            }
            else if ( line.indexOf("\t")==0)
            {
                line = line.substr(1);
                trimmed += "\t";
            }
        }
        link.text = line;
        return trimmed;
    };
    /**
     * Start a new level of preformatting
     * @param level the depth of the level (greater than 0)
     */
    this.startPre = function( level )
    {
        var text = "<pre";
        var prop = this.dialect.codeblocks[level-1].prop;
        if ( prop != undefined && prop.length > 0 )
            text += ' class="'+prop+'">';
        else
            text += '>';
        this.formatted = true;
        return text;
    };
    /**
     * Is the current line a milestone?
     * @para, line the line to test
     * @param mss an array of milestone defs
     * @return the relevant milestone
     */
    this.isMilestone = function( line, mss )
    {
        var line2 = line.trim();
        for ( var i=0;i<mss.length;i++ )
        {
            var ms = mss[i];
            if ( this.startPos(line2,ms.leftTag)==0 
                && this.endPos(line2,ms.rightTag)
                ==line2.length-ms.rightTag.length )
                return ms;
        }
        return undefined;
    };
    /**
     * Get the indent level of this line
     * @param line the line with some leading spaces
     * @return the level (4 spaces or a tab == 1 level)
     */
    this.getLevel = function( line )
    {
        var level = 0;
        var spaces = 0;
        var j;
        for ( j=0;j<line.length;j++ )
        {
            var token = line.charAt(j);
            if ( token =='\t' )
                level++;
            else if ( token==' ' )
            {
                spaces++;
                if ( spaces >= 4 )
                {
                    level++;
                    spaces = 0;
                }
            }
            else
                break;
        }
        // completely blank lines are NOT indented
        return (j==line.length)?0:level;
    };
    /**
     * Look for four leading white spaces and format as pre
     * @param para the paragraph to process
     * @param end the next paragraph
     */
    this.processCodeBlocks = function( para, end )
    {
        if ( this.dialect.codeblocks!=undefined )
        {
            var mss = (this.dialect.milestones!=undefined
                &&this.dialect.milestones.length>0)
                ?this.dialect.milestones:undefined;
            var lines = para.text.split("\n");
            var level = 0;
            if ( lines.length > 0 )
            {
                // turn lines of para into linked list
                var line = new Link("","",lines[0],null,para);
                para.next = line;
                para.text = "";
                for ( var i=1;i<lines.length;i++ )
                {
                    var prev = line;
                    line = new Link("\n","",lines[i],null,prev);
                    prev.next = line;
                }
                line.next = end;
                end.prev = line;
                line = para.next;
                while ( line != end && line != null )
                {
                    var currLevel = this.getLevel(line.text);
                    if ( mss == undefined || this.isMilestone(line.text,mss)==undefined )
                    {
                        if ( currLevel > level )
                        {
                            if ( level > 0 )
                                line.html = '</pre>';
                            if ( currLevel <= this.dialect.codeblocks.length )
                                line.html += this.startPre(currLevel);
                            else // stay at current level
                                currLevel = level;
                        }
                        else if ( currLevel < level )
                        {
                            line.html += '</pre>';
                            if ( currLevel > 0 )
                                line.html += this.startPre(currLevel);
                        }
                        level = currLevel;
                    }
                    if ( line.text.length>0 )
                        line.mml += this.leadTrim(line,currLevel);
                    line = line.next;
                }
                if ( level > 0 )
                    end.prependHtml("</pre>\n");
            }
        }
    };
    /**
     * Convert smart quotes as fast as possible. Do this first.
     * @param para the Link containing the paragraph
     * @param para the next paragraph node
     */
    this.processSmartQuotes = function( para, end )
    {
        if ( this.dialect.smartquotes )
        {
            var link = para;
            var text = link.text;
            for ( var i=0;i<text.length;i++ )
            {
                var c = text[i];
                if ( this.isQuote(c) )
                {
                    var prev = text[i-1];
                    // this doesn't change the length of the text
                    if ( i==0||(this.isSpace(prev)
                        ||this.isOpeningQuote(prev)||this.isOpeningBracket(prev)) )
                        text = text.slice(0,i)+this.openQuote(c)+text.slice(i+1);
                    else
                        text = text.slice(0,i)+this.closeQuote(c)+text.slice(i+1);
                }
            }
            link.text = text;
        }        
    };
    /**
     * Process a list of paragraphs in a section
     * @param para the first paragraph to process
     * @param end the ending para
     */
    this.processPara = function( para, end )
    {
        var old_lines = this.num_lines;
        var text_lines = this.countLines(para.text);
        this.formatted = false;
        this.processSmartQuotes(para,end);
        this.processCodeBlocks(para,end);
        this.processHeadings(para,end);
        this.processQuotations(para,end);
        this.processPfmts(para,end);
        this.processDividers(para,end);
        this.processCfmts(para,end);
        if ( !this.formatted )
        {
            var attr = (this.dialect.paragraph!=undefined
                &&this.dialect.paragraph.prop!=undefined
                &&this.dialect.paragraph.prop.length>0)
                ?' class="'+this.dialect.paragraph.prop+'" title="'
                +this.dialect.paragraph.prop+'"':"";
            while ( para.text.length == 0 && para.next != end 
                && para.next != null )
                para = para.next;
            para.html += '<p'+attr+'>';
            end.prependHtml('</p>');
        }
        if ( this.num_lines-old_lines != text_lines )
            console.log("added_lines="+(this.num_lines-old_lines)+" text_lines="+text_lines);
    };
    /**
     * Process all the paras in a section
     * @param section the Link containing the section
     * @param the end-section or end-marker
     */
    this.processSection = function( section, end )
    {
        // strip leading new lines
        while ( section.text.length > 0 && section.text.indexOf("\n")==0 )
        {
            section.text = section.text.substr("\n".length);
            section.mml += "\n"; // preserve for length calculation
            this.num_lines++;
        }
        var text = section.text;
        var state = 0;
        section.text = "";
        var prev = new Link("","","",null,section);
        section.next = prev;
        var breakText = ""; 
        var lastPos = 0;
        // we can't use split because some split points
        // are "\n \n" or "\n    \n" and regular expressions
        // won't let us recover what the split string was
        for ( var i=0;i<text.length;i++ )
        {
            var c = text[i];
            switch ( state )
            {
                case 0:
                    if ( c == '\n' )
                    {
                        state = 1;
                        breakText = '\n';
                    }
                    break;
                case 1:
                    if ( c == '\n' )
                    {
                        var endPos = i-breakText.length;
                        prev.text = text.substr(lastPos,endPos-lastPos);
                        breakText += c;
                        var link = new Link(breakText,"","",null,prev);
                        prev.next = link;
                        lastPos = endPos+breakText.length;
                        prev = link;
                        state = 0;
                    }
                    else if ( c != ' ' && c != '\t' )
                        state = 0;
                    else
                        breakText += c;
                    break;               
            }
        }
        prev.text = text.substr(lastPos);
        prev.next = end;
        end.prev = prev;
        // process all paragraphs in this section
        var temp = section.next;
        var added_lines = 0;
        while ( temp != end )
        {
            var next = temp.next;
            if ( next != end )
                this.processPara(temp,next);
            this.num_lines += this.countLines(temp.mml);
            temp = next;
        }
    };
    /** 
     * Does this section only contains white space?
     * @param section the text of the section
     * @return true
     */
    this.isEmptySection = function(section) {
        var empty = true;
        for ( var i=0;i<section.length;i++ )
        {
            var c = section.charAt(i);
            if ( c!='\t'||c!=' '||c!= '\n' )
                return false;
        }
        return true;
    };
    /**
     * Make a 2-element array reference out of the current fofset object
     * @param mml the mml offset
     * @param html the html base text offset
     * @return a 2-element array being mml,html base text offsets
     */
    this.makeReference = function(mml,html) {
        var array = new Array(2);
        array[0] = this.offset.mml;
        array[1] = this.offset.html;
    };
    /**
     * Compare one text with another
     * @param t1 the first text
     * @param t2 its supposed copy
     */
    this.compare = function( t1, t2 ) {
        var lineNo = 1;
        var charNo = 0;
        for ( var i=0;i<t1.length&&i<t2.length;i++ )
        {
            if ( t1.charAt(i) != t2.charAt(i) )
            {
                break;
                console.log("texts differ line "+lineNo+" char "+charNo);
            }
            else if ( t1.charAt(i)=='\n' )
            {
                lineNo++;
                charNo=0;
            }
            else
                charNo++;
        }
        if ( t1.length != t2.length )
            console.log("texts differ in length: "+t1.length+" vs "+t2.length);
    };
    /**
     * Count the number of lines in some text
     * @param text the text to count \ns in
     */
    this.countLines = function(text) {
        var count = 0;
        for ( var i=0;i<text.length;i++ )
            if ( text[i]=='\n' )
                count++;
        return count;
    };
    /**
     * Convert the MML text into HTML
     * @param text the MML text to convert
     * @return HTML
     */
    this.toHTML = function(text,text_lines)
    {
        var startTime = new Date().getMilliseconds();
        var html = "";
        var first=null;
        this.num_lines = 0;
        this.text_lines = text_lines;
        this.mmlToHtml = new Array();
        this.buildHeadLookup();
        this.buildCfmtLookup();
        this.buildDividerLookup();
        var sectionName = (this.dialect.section!=undefined
            &&this.dialect.section.prop!=undefined)
            ?this.dialect.section.prop:"section";
        var sections = text.split("\n\n\n");
        if ( sections.length > 0 )
        {
            var additional_lines = 0;
            var link = new Link("",'<div class="'+sectionName+'">',
                sections[0],null,null);
            first = link;
            for ( var i=1;i<sections.length;i++ )
            {
                var prev = link;
                link = new Link("\n\n\n",'</div>\n<div class="'
                    +sectionName+'">',sections[i],null,prev);
                prev.next = link;
            }
            // balance HTML
            link.next = new Link("","</div>","",null,link);
            // now process the list
            var temp = first;
            while ( temp != null )
            {
                var next = temp.next;
                if ( next != null )
                {
                    if ( !this.isEmptySection(temp.text) )
                        this.processSection(temp,next);
                    else
                        this.num_lines += this.countLines(temp.text);
                    this.num_lines+=3;
                }
                temp = next;
            }
        }
        var endTime = new Date().getMilliseconds();
        console.log("time to format="+(endTime-startTime));
        this.compare( text, first.toMml() );
        console.log("num_lines="+this.num_lines);
        return first.toHtml();
    };
}
