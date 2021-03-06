/*
 * This file is part of MML.
 *
 *  MML is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU General Public License as published by
 *  the Free Software Foundation, either version 2 of the License, or
 *  (at your option) any later version.
 *
 *  MML is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU General Public License for more details.
 *
 *  You should have received a copy of the GNU General Public License
 *  along with MML.  If not, see <http://www.gnu.org/licenses/>.
 *  (c) copyright Desmond Schmidt 2016
 */

package mml.handler.get;

import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import java.io.File;
import java.util.HashSet;
import mml.MMLWebApp;
import mml.constants.Params;
import mml.exception.MMLException;
import calliope.core.Utils;
import calliope.core.constants.Database;
import calliope.core.constants.JSONKeys;
import calliope.core.database.Connector;
import calliope.core.database.Connection;
import calliope.core.exception.DbException;
import calliope.core.DocType;

/**
 * Get a list of all unedited letters
 * @author desmond
 */
public class MMLGetUneditedLetters 
{
    String docid;
    File root;
    static HashSet<String> map;
    
    /**
     * Chop the file's extension
     * @param name the filename to truncate
     * @return the truncated filename
     */
    String removeExtension( String name )
    {
        int pos = name.lastIndexOf(name);
        if ( pos != -1 )
            return name.substring(0,pos);
        else
            return name;
    }
    /**
     * Does this file have a HLI type filename?
     * @param f the file to test
     * @return true if it is
     */
    boolean isLetter( File f )
    {
        String name = f.getName();
        name = removeExtension(name);
        return DocType.isLetter(name);
    }
    /**
     * Get the letter identifier minus the .jpg and page number
     * @param longName the full file name
     * @return the shortened letter-identifier
     */
    String getShortName( String longName )
    {
        String[] parts = longName.split("-");
        StringBuilder sb = new StringBuilder();
        //if ( longName.equals("P452-DUNCAN-PARKES.jpg") )
        //    System.out.println("Aha");
        for ( int i=0;i<parts.length;i++ )
        {
            if ( i !=parts.length-3 || !DocType.isPage(parts[i]) )
            {
                if ( i==parts.length-1 && parts[i].endsWith(".jpg") )
                {
                    int index = parts[i].lastIndexOf(".");
                    parts[i] = parts[i].substring(0,index);
                }
                if ( sb.length()>0 )
                    sb.append("-");
                sb.append(parts[i]);
            }
        }
        //if ( sb.toString().equals("DUNCAN") )
         //   System.out.println("DUNCAN");
        return sb.toString();
    }
    /**
     * Get the directory path to a relative file path
     * @param path the relative path to (and including) the file name
     * @return just the directory relpath not the file name
     */
    String getDirPath( String path )
    {
        int index = path.lastIndexOf("/");
        if ( index != -1 )
            return path.substring(0,index);
        else
            return "";
    }
    String composeDocId( String dirPath, String hli )
    {
        String newDocid;
        if ( dirPath.length()>0 )
           newDocid = docid+"/"
                +dirPath.toLowerCase()+"/"+hli.toLowerCase();
        else
           newDocid = docid+"/"+hli.toLowerCase();
        return newDocid;
    }
    /**
     * Look for letters with HLI identifiers as filenames
     * @param dir 
     */
    void parseDir( File dir )
    {
        File[] files = dir.listFiles();
        for ( int i=0;i<files.length;i++ )
        {
            if ( files[i].isDirectory() )
                parseDir(files[i]);
            else if ( isLetter(files[i]) )
            {
                String relPath = Utils.subtractPaths(files[i].getAbsolutePath(),
                    root.getAbsolutePath());
                String dirPath = getDirPath( relPath );
                String shortName = getShortName(files[i].getName());
                String newDocid = composeDocId( dirPath, shortName );
                if ( !map.contains(newDocid) )
                {
                    map.add( newDocid );
                }
            }
        }
    }
    /**
     * Using the map of all letters reduce it by removing those that already 
     * have a document in cortex.
     */
    void reduceMap() throws DbException
    {
         Connection conn = Connector.getConnection();
         String[] docids = conn.listDocuments( Database.CORTEX,
             docid+"/.*",JSONKeys.DOCID );
         for ( int i=0;i<docids.length;i++ )
         {
             if ( map.contains(docids[i]) )
             {
                 map.remove(docids[i]);
             }
         }
    }
    /**
     * Handle the request
     * @param request the request
     * @param response the response
     * @param urn the remaining urn of the request
     * @throws MMLException 
     */
    public void handle( HttpServletRequest request, 
        HttpServletResponse response, String urn ) throws MMLException 
    {
        // go through the corpix directory for the given docid and 
        // identify all letters that do NOT have a transcription in cortex
        try
        {
            docid = request.getParameter(Params.DOCID);
            if ( docid == null )
                throw new Exception("You must specify a docid parameter");
            String corpixPath = MMLWebApp.webRoot+"/corpix/"+docid;
            root = new File(corpixPath);
            map = new HashSet<String>();
            parseDir( root );
            reduceMap();
            // now write it back out in JSON
        }
        catch ( Exception e )
        {
            throw new MMLException(e);
        }
    }
}
